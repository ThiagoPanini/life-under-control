import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { addMeses, mesDe } from "./derive-bill-card"

/**
 * Os três destaques do último mês fechado, derivados dos fatos (ADR-0003, puro,
 * sem React). Interpretação, nunca coluna (CONTEXT.md #3): a variação só existe
 * entre meses fechados — o mês corrente é parcial e fica de fora. Compara o último
 * fechado (`competenciaFechada = hoje − 1 mês`) contra o anterior
 * (`competenciaBase = hoje − 2 meses`), agregando as baixas por Conta antes de
 * medir (splits somam). Cada métrica é uma união discriminada: sem candidato
 * calculável, vira `insuficiente` — jamais um zero ou percentual artificial.
 */

/**
 * A variação de uma Conta entre o mês-base e o mês fechado. `insuficiente` quando
 * nenhuma Conta tem base válida no sinal pedido (nenhuma alta/queda calculável).
 * No `ok`, o `percentual` existe sempre: só é candidato quem tem `base > 0` nos
 * dois meses (CONTEXT.md #6 — nada de dividir por zero nem "+100%" artificial de
 * Conta nova; essa Conta simplesmente não concorre à variação).
 */
export type VariacaoConta =
  | { estado: "insuficiente" }
  | {
      estado: "ok"
      billId: string
      nome: string
      /** Centavos agregados no mês-base (sempre > 0 — pré-requisito do candidato). */
      base: number
      /** Centavos agregados no mês fechado. */
      atual: number
      /** `atual − base`, em centavos: positivo é alta, negativo é queda. */
      delta: number
      /** Variação percentual sobre a base. */
      percentual: number
    }

/**
 * O maior Lançamento individual do mês fechado — fato único, não o agregado da
 * Conta (uma Conta com muitas baixas pequenas não vence uma baixa grande de outra;
 * é a correção deliberada de #101 sobre o protótipo, que usava o agregado).
 */
export type MaiorLancamento =
  | { estado: "insuficiente" }
  | {
      estado: "ok"
      billId: string
      nome: string
      valor: number
      competencia: string
      paymentId: string
    }

/** Os três destaques + as competências (corrente/comparadas) para rotular a UI. */
export type DestaquesMes = {
  /** Mês corrente (parcial, em curso) — só para rotular "X em curso" na UI. */
  competenciaCorrente: string
  competenciaBase: string
  competenciaFechada: string
  maiorAlta: VariacaoConta
  maiorQueda: VariacaoConta
  maiorLancamento: MaiorLancamento
}

/** Candidato à alta/queda: uma Conta presente nos dois meses, com base positiva. */
type CandidatoVariacao = {
  billId: string
  nome: string
  base: number
  atual: number
  delta: number
  percentual: number
}

/**
 * Deriva os destaques do último mês fechado a partir de todas as Contas do Lar e
 * de todos os Lançamentos (o mesmo array da Análise Histórica — nenhuma query
 * nova). Puro: só o `Clock` decide "hoje"; nada de React/Drizzle/Next.
 *
 * Desempate determinístico e documentado: alta/queda empatadas no `percentual`
 * escolhem o menor `billId`; Lançamentos empatados no `valor` escolhem o menor
 * `paymentId`. Escolha arbitrária, mas estável e sem colisão (ids únicos).
 */
export function derivarDestaquesMes(
  clock: Clock,
  bills: Bill[],
  payments: Payment[],
): DestaquesMes {
  const mesCorrente = mesDe(clock.hoje())
  const competenciaFechada = addMeses(mesCorrente, -1)
  const competenciaBase = addMeses(mesCorrente, -2)

  const nomePorBill = new Map(bills.map((bill) => [bill.id, bill.nome]))
  const resolverNome = (billId: string) => nomePorBill.get(billId) ?? "Conta"

  // Agrega, por Conta, os centavos de cada um dos dois meses comparados (splits
  // somam) — uma varredura só dos fatos que caem nas duas competências.
  const basePorBill = new Map<string, number>()
  const atualPorBill = new Map<string, number>()
  for (const payment of payments) {
    if (payment.competencia === competenciaBase) {
      basePorBill.set(payment.billId, (basePorBill.get(payment.billId) ?? 0) + payment.valor)
    } else if (payment.competencia === competenciaFechada) {
      atualPorBill.set(payment.billId, (atualPorBill.get(payment.billId) ?? 0) + payment.valor)
    }
  }

  // Candidatos à variação: só Contas presentes nos DOIS meses com base positiva —
  // é a comparação mês-a-mês honesta. Conta nova (sem base) ou encerrada (sem mês
  // fechado) não tem variação calculável e fica de fora (CONTEXT.md #3, #6).
  const candidatos: CandidatoVariacao[] = []
  for (const [billId, base] of basePorBill) {
    const atual = atualPorBill.get(billId)
    if (atual === undefined || base <= 0) continue
    candidatos.push({
      billId,
      nome: resolverNome(billId),
      base,
      atual,
      delta: atual - base,
      percentual: ((atual - base) / base) * 100,
    })
  }

  return {
    competenciaCorrente: mesCorrente,
    competenciaBase,
    competenciaFechada,
    maiorAlta: selecionarVariacao(candidatos, "alta"),
    maiorQueda: selecionarVariacao(candidatos, "queda"),
    maiorLancamento: selecionarMaiorLancamento(payments, competenciaFechada, resolverNome),
  }
}

/**
 * Escolhe a maior alta (percentual > 0) ou a maior queda (percentual < 0) entre os
 * candidatos, pelo percentual (como o protótipo). Empate no percentual → menor
 * `billId`. Sem candidato do sinal pedido → `insuficiente`.
 */
function selecionarVariacao(
  candidatos: CandidatoVariacao[],
  tipo: "alta" | "queda",
): VariacaoConta {
  const doSinal = candidatos.filter((c) => (tipo === "alta" ? c.percentual > 0 : c.percentual < 0))
  if (doSinal.length === 0) return { estado: "insuficiente" }

  const melhor = doSinal.reduce((atual, candidato) => {
    // Alta quer o maior percentual; queda o menor (mais negativo). Empate: menor billId.
    const vence =
      tipo === "alta"
        ? candidato.percentual > atual.percentual
        : candidato.percentual < atual.percentual
    if (vence) return candidato
    if (candidato.percentual === atual.percentual && candidato.billId < atual.billId)
      return candidato
    return atual
  })

  return { estado: "ok", ...melhor }
}

/**
 * O maior Lançamento individual do mês fechado. Varre os fatos daquela
 * competência (não o agregado) e escolhe o de maior `valor`; empate → menor
 * `paymentId`. Sem fato no mês fechado → `insuficiente`.
 */
function selecionarMaiorLancamento(
  payments: Payment[],
  competenciaFechada: string,
  resolverNome: (billId: string) => string,
): MaiorLancamento {
  const doMes = payments.filter((p) => p.competencia === competenciaFechada)
  if (doMes.length === 0) return { estado: "insuficiente" }

  const maior = doMes.reduce((atual, payment) => {
    if (payment.valor > atual.valor) return payment
    if (payment.valor === atual.valor && payment.id < atual.id) return payment
    return atual
  })

  return {
    estado: "ok",
    billId: maior.billId,
    nome: resolverNome(maior.billId),
    valor: maior.valor,
    competencia: maior.competencia,
    paymentId: maior.id,
  }
}
