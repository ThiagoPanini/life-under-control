import type { Bill, BillEstado } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import { JANELA_HISTORICA_MESES, MENSAL } from "./derive-analise-historica"
import {
  ehOcorrenciaDaRecorrencia,
  mesDe,
  ocorrenciasRecentes,
  resolverVencimento,
} from "./derive-bill-card"

// A regra de fase da Recorrência (quando uma Conta não-mensal ocorre) vive em
// `derive-bill-card` — fonte única com o card. Reexportada para os testes do Mapa.
export { ehOcorrenciaDaRecorrencia as ehOcorrencia }

/**
 * O **Mapa do Ano** (issue #102): a matriz Conta × Competência das últimas doze
 * Competências (a mesma janela da Análise Histórica). Nada aqui é coluna — cada
 * célula é derivada da vigência da Conta, da sua Recorrência, dos Lançamentos e do
 * `Clock`/`Calendar` (invariante #3: persistir fatos, derivar interpretações).
 *
 * A **vigência** de cada Conta vai da `primeiraCompetencia` (onde ela passa a
 * projetar) até a Competência do encerramento (`encerradaEm`), ou é aberta se
 * ativa. Meses fora dela nunca são "não pagos": são `fora-vigencia`. Dentro dela,
 * um mês fora da Recorrência é `sem-ocorrencia`; uma ocorrência sem fato é
 * `por-vir` ou `vencida` conforme o vencimento; uma ocorrência com fato soma os
 * splits e se compara à **média da própria Conta** (só fatos válidos, lacuna ≠
 * zero) com tolerância de ±5%.
 */

/** A janela do Mapa: as doze Competências até a atual — a MESMA da Análise Histórica (ADR-0011). */
export const JANELA_MAPA_MESES = JANELA_HISTORICA_MESES

/**
 * Tolerância de ±5% para "na média" sem ponto flutuante: `|desvio| ≤ 5% da média`
 * ⇔ `|desvio| * 20 ≤ media` (5% = média/20). Centavos inteiros (invariante #6).
 */
const TOLERANCIA_DIVISOR = 20

/**
 * Estado de uma célula do Mapa. `fora-vigencia`/`sem-ocorrencia` são ausências
 * honestas (não "não pago"); `por-vir`/`vencida` são ocorrências sem fato; o trio
 * `acima`/`na-media`/`abaixo` classifica o fato contra a média da Conta.
 */
export type EstadoCelula =
  | "fora-vigencia"
  | "sem-ocorrencia"
  | "por-vir"
  | "vencida"
  | "acima"
  | "na-media"
  | "abaixo"

/** Uma célula do Mapa: a Competência, seu estado, o valor agregado e o desvio vs média. */
export type CelulaMapa = {
  competencia: string
  estado: EstadoCelula
  /** Soma dos fatos (centavos) da Conta+Competência; `null` sem fato (lacuna ≠ zero). */
  valor: number | null
  /** Desvio (centavos) vs média da Conta (`valor - media`); `null` quando não calculável. */
  desvio: number | null
}

/** Uma linha do Mapa: a Conta, sua média de fatos válidos e as doze células da janela. */
export type LinhaMapa = {
  billId: string
  nome: string
  icon: string
  estado: BillEstado
  /** Média (centavos) dos fatos válidos da Conta na janela; `null` sem histórico. */
  media: number | null
  /** As doze células, da Competência mais antiga à mais recente. */
  celulas: CelulaMapa[]
}

/**
 * O Mapa do Ano. `sem-contas` é o vazio honesto: nenhuma Conta com vigência
 * interceptando a janela. `com-contas` traz a janela e uma linha por Conta viva
 * no período (incluindo encerradas cuja vigência ainda toca a janela).
 */
export type MapaDoAno =
  | { estado: "sem-contas" }
  | { estado: "com-contas"; competencias: string[]; linhas: LinhaMapa[] }

/** Classifica um fato contra a média da Conta com tolerância de ±5% (centavos inteiros). */
export function classificarValor(valor: number, media: number): "acima" | "na-media" | "abaixo" {
  const desvio = valor - media
  if (Math.abs(desvio) * TOLERANCIA_DIVISOR <= media) return "na-media"
  return desvio > 0 ? "acima" : "abaixo"
}

/**
 * Deriva o Mapa do Ano a partir do `Clock`/`Calendar` (os ports) e dos fatos (as
 * Contas e seus Lançamentos). A borda injeta os adapters reais; o Seam 1 injeta os
 * fakes. Uma varredura indexa os Lançamentos por Conta; cada Conta cuja vigência
 * intercepta a janela vira uma linha.
 */
export function derivarMapaAno(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): MapaDoAno {
  const hoje = clock.hoje()
  const janela = ocorrenciasRecentes(MENSAL, mesDe(hoje), JANELA_MAPA_MESES)
  const primeiro = janela[0]
  const ultimo = janela[janela.length - 1]
  const porConta = indexarPorConta(payments)

  const linhas: LinhaMapa[] = []
  for (const bill of bills) {
    const fim = bill.encerradaEm ? mesDe(bill.encerradaEm) : null
    // A vigência intercepta a janela? (começa antes do fim da janela e não terminou antes do início.)
    if (bill.primeiraCompetencia > ultimo) continue
    if (fim != null && fim < primeiro) continue

    // Totais por Competência na janela E dentro da vigência — splits da mesma
    // Conta+Competência somam. Fato fora da vigência (competência anterior à
    // primeira ou posterior ao encerramento) é oculto na célula (fora-vigencia);
    // não pode entrar na média, senão poluiria uma média sem célula correspondente.
    const totais = new Map<string, number>()
    for (const p of porConta.get(bill.id) ?? []) {
      if (p.competencia < primeiro || p.competencia > ultimo) continue
      if (p.competencia < bill.primeiraCompetencia || (fim != null && p.competencia > fim)) continue
      totais.set(p.competencia, (totais.get(p.competencia) ?? 0) + p.valor)
    }
    const valores = [...totais.values()]
    const media =
      valores.length === 0 ? null : Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)

    const celulas = janela.map((competencia) =>
      classificarCelula(bill, competencia, totais.get(competencia), media, fim, hoje, calendar),
    )
    linhas.push({
      billId: bill.id,
      nome: bill.nome,
      icon: bill.icon,
      estado: bill.estado,
      media,
      celulas,
    })
  }

  if (linhas.length === 0) return { estado: "sem-contas" }
  return { estado: "com-contas", competencias: janela, linhas }
}

/**
 * Classifica uma célula. Ordem de precedência: fora da vigência primeiro; depois um
 * fato presente (nunca escondido, mesmo caindo fora da Recorrência); só então a
 * ocorrência sem fato (por-vir/vencida) e o mês sem ocorrência.
 */
function classificarCelula(
  bill: Bill,
  competencia: string,
  total: number | undefined,
  media: number | null,
  fim: string | null,
  hoje: string,
  calendar: Calendar,
): CelulaMapa {
  if (competencia < bill.primeiraCompetencia || (fim != null && competencia > fim))
    return { competencia, estado: "fora-vigencia", valor: null, desvio: null }

  if (total != null) {
    // Há fato: há ao menos um valor, logo a média não é null. O guard mantém o tipo honesto.
    const estado = media == null ? "na-media" : classificarValor(total, media)
    const desvio = media == null ? null : total - media
    return { competencia, estado, valor: total, desvio }
  }

  if (!ehOcorrenciaDaRecorrencia(bill.recurrence, competencia))
    return { competencia, estado: "sem-ocorrencia", valor: null, desvio: null }

  const vencimento = resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar)
  // "Vence hoje" já é vencida (>=), como o farol/grid do card (vencimento ≤ hoje é
  // o buraco em aberto) — os dois cockpits não podem discordar da urgência no dia D.
  return {
    competencia,
    estado: hoje >= vencimento ? "vencida" : "por-vir",
    valor: null,
    desvio: null,
  }
}

/** Agrupa os Lançamentos por Conta numa varredura — o índice que cada linha consulta. */
function indexarPorConta(payments: Payment[]): Map<string, Payment[]> {
  const indice = new Map<string, Payment[]>()
  for (const p of payments) {
    const grupo = indice.get(p.billId)
    if (grupo) grupo.push(p)
    else indice.set(p.billId, [p])
  }
  return indice
}
