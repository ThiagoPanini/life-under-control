import type { Bill, DueRule, Recurrence } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"

/**
 * Derivações do **card da Conta** (issue #21). Nada aqui é coluna — tudo é
 * calculado de Conta + Lançamentos + `Clock` + `Calendar` (invariante #3:
 * persistir fatos, derivar interpretações). A Conta projeta o "quando"
 * (vencimento esperado); os Lançamentos contam o "quanto" e "quando pagou".
 *
 * O card vive da composição de quatro lentes sobre a mesma janela de ocorrências:
 * o **farol** do mês vigente, o **grid** das últimas 12 ocorrências, e a **média
 * 12 + sparkline** dos valores pagos. As cores e o desenho exato são do Mirante;
 * aqui se fixa a *semântica* de cada estado.
 */

/** Tamanho da janela do grid e do sparkline: as últimas 12 ocorrências. */
export const OCORRENCIAS_NA_JANELA = 12

/**
 * Limiar (dias) de **proximidade** do farol: faltando ≤ N dias para o vencimento,
 * o farol acende amarelo. Constante global e distinta da tolerância do grid —
 * são o mesmo número hoje (3), mas significam coisas diferentes e podem divergir.
 */
export const LIMIAR_PROXIMIDADE_DIAS = 3

/**
 * Limiar (dias) de **tolerância** do grid: pago até N dias após o vencimento conta
 * como atraso leve (não atraso cheio). Constante global, irmã do limiar do farol.
 */
export const LIMIAR_TOLERANCIA_DIAS = 3

/** Farol do mês vigente: pago (verde), longe (cinza), perto (amarelo) ou vencido/hoje (vermelho). */
export type FarolEstado = "verde" | "cinza" | "amarelo" | "vermelho"

/**
 * Estado de uma ocorrência no grid Airflow. "em-aberto" (venceu, nunca pago) é o
 * "buraco" — distinto do vermelho sólido do farol; "aguardando" ainda não venceu;
 * "pago-sem-data" é histórico neutro (backfill sem recibo); "fora-vigencia" é
 * anterior à primeira Competência da Conta (fora do período de vigência —
 * ADR-0011), nunca um buraco: célula vazia e apagada, fora da pontualidade.
 */
export type GridEstado =
  | "em-dia"
  | "atraso-leve"
  | "atraso"
  | "em-aberto"
  | "aguardando"
  | "pago-sem-data"
  | "fora-vigencia"

/** Uma célula do grid: a ocorrência (competência), seu vencimento esperado, estado e valor pago. */
export type GridCelula = {
  /** Competência da ocorrência (`YYYY-MM`). */
  competencia: string
  /** Vencimento esperado derivado da regra (`YYYY-MM-DD`). */
  vencimento: string
  estado: GridEstado
  /** Valor pago em centavos, ou `null` quando a ocorrência não tem Lançamento (lacuna). */
  valor: number | null
}

/** O card derivado por inteiro: vencimento vigente, farol, grid e o resumo dos valores pagos. */
export type CardConta = {
  /** Vencimento esperado da ocorrência vigente (`YYYY-MM-DD`). */
  vencimentoVigente: string
  farol: FarolEstado
  /** As 12 ocorrências da mais antiga à mais recente. */
  grid: GridCelula[]
  /** Média (centavos) dos valores pagos na janela; `null` sem histórico. */
  media: number | null
  /** Os 12 valores pagos na ordem do grid; `null` onde não houve pagamento (lacuna ≠ zero). */
  sparkline: (number | null)[]
}

const MS_DIA = 86_400_000

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Índice absoluto de mês de uma competência `YYYY-MM` (`ano*12 + mes-1`). */
function indiceMes(competencia: string): number {
  const [ano, mes] = competencia.split("-").map(Number)
  return ano * 12 + (mes - 1)
}

function competenciaDoIndice(idx: number): string {
  const ano = Math.floor(idx / 12)
  const mes = (idx % 12) + 1
  return `${ano}-${pad2(mes)}`
}

/** Soma `n` meses a uma competência `YYYY-MM` (negativo recua), tratando o ano. */
export function addMeses(competencia: string, n: number): string {
  return competenciaDoIndice(indiceMes(competencia) + n)
}

/** Mês (competência `YYYY-MM`) de uma data civil `YYYY-MM-DD`. */
export function mesDe(iso: string): string {
  return iso.slice(0, 7)
}

/** Último dia civil do mês (1-based) — pega 29/02 em ano bissexto via `Date.UTC`. */
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

function comoTimestamp(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number)
  return Date.UTC(ano, mes - 1, dia)
}

/** Dias civis entre duas datas (`ate - de`), positivo quando `ate` é depois. */
function diffEmDias(de: string, ate: string): number {
  return Math.round((comoTimestamp(ate) - comoTimestamp(de)) / MS_DIA)
}

/**
 * Resolve o vencimento esperado (`YYYY-MM-DD`) de uma competência: a competência
 * desloca `dueMonthOffset` meses e a regra resolve o dia. `dia-fixo` cai no dia
 * civil (grampeado ao fim do mês quando passa); `n-esimo-dia-util` e
 * `ultimo-dia-util` caminham pelos dias úteis via `Calendar`.
 */
export function resolverVencimento(
  dueRule: DueRule,
  dueMonthOffset: number,
  competencia: string,
  calendar: Calendar,
): string {
  const alvo = addMeses(competencia, dueMonthOffset)
  const [ano, mes] = alvo.split("-").map(Number)
  const ultimo = ultimoDiaDoMes(ano, mes)

  switch (dueRule.kind) {
    case "dia-fixo":
      return `${alvo}-${pad2(Math.min(dueRule.day, ultimo))}`
    case "n-esimo-dia-util": {
      let uteis = 0
      let ultimoUtil = `${alvo}-${pad2(ultimo)}`
      for (let dia = 1; dia <= ultimo; dia++) {
        const iso = `${alvo}-${pad2(dia)}`
        if (calendar.ehDiaUtil(iso)) {
          uteis += 1
          ultimoUtil = iso
          if (uteis === dueRule.nth) return iso
        }
      }
      // Menos dias úteis no mês que o N pedido: cai no último dia útil disponível.
      return ultimoUtil
    }
    case "ultimo-dia-util": {
      for (let dia = ultimo; dia >= 1; dia--) {
        const iso = `${alvo}-${pad2(dia)}`
        if (calendar.ehDiaUtil(iso)) return iso
      }
      // Mês sem nenhum dia útil é impossível no calendário real; fallback defensivo.
      return `${alvo}-${pad2(ultimo)}`
    }
  }
}

/** O mês (1–12) casa a fase da âncora, dado o intervalo? Intervalo ≤ 1 ou âncora nula ocorre sempre. */
function mesCasaAncora(mes: number, intervalMonths: number, anchorMonth: number | null): boolean {
  if (intervalMonths <= 1 || anchorMonth == null) return true
  return (((mes - anchorMonth) % intervalMonths) + intervalMonths) % intervalMonths === 0
}

/**
 * A Competência `YYYY-MM` é uma ocorrência da Recorrência? Mensal (ou sem âncora)
 * ocorre todo mês; com intervalo > 1 e âncora, só nos meses em fase com a âncora.
 * Fonte única da regra de fase — o card, `ocorrenciasRecentes` e o Mapa do Ano a
 * compartilham, para não divergirem sobre quando uma Conta não-mensal ocorre.
 */
export function ehOcorrenciaDaRecorrencia(recurrence: Recurrence, competencia: string): boolean {
  return mesCasaAncora(
    Number(competencia.slice(5, 7)),
    recurrence.intervalMonths,
    recurrence.anchorMonth,
  )
}

/**
 * As últimas `n` competências de ocorrência ≤ `refCompetencia`, da mais antiga à
 * mais recente. Mensal devolve os últimos `n` meses; quando o intervalo > 1, recua
 * até a âncora (a ocorrência mais recente que casa com a periodicidade) e então
 * salta de `intervalMonths` em `intervalMonths`.
 */
export function ocorrenciasRecentes(
  recurrence: Recurrence,
  refCompetencia: string,
  n: number,
): string[] {
  const { intervalMonths, anchorMonth } = recurrence
  let idx = indiceMes(refCompetencia)

  if (intervalMonths > 1 && anchorMonth != null) {
    // Recua mês a mês até o primeiro que casa com a fase da âncora.
    while (!mesCasaAncora((idx % 12) + 1, intervalMonths, anchorMonth)) idx -= 1
  }

  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(competenciaDoIndice(idx))
    idx -= intervalMonths
  }
  return out.reverse()
}

function estadoGrid(pagamento: Payment | undefined, vencimento: string, hoje: string): GridEstado {
  if (pagamento) {
    if (pagamento.dataPagamento == null) return "pago-sem-data"
    const atraso = diffEmDias(vencimento, pagamento.dataPagamento)
    if (atraso <= 0) return "em-dia"
    if (atraso <= LIMIAR_TOLERANCIA_DIAS) return "atraso-leve"
    return "atraso"
  }
  // Sem pagamento: ainda dá tempo (aguardando) ou já venceu sem quitar (em-aberto, o buraco).
  return diffEmDias(hoje, vencimento) > 0 ? "aguardando" : "em-aberto"
}

/**
 * A baixa que representa a Competência para efeito de estado/pontualidade: a que
 * **completa** o pagamento — a mais recente por `dataPagamento`. Numa baixa partida
 * (mais de um Lançamento no mês, schema permitido), a pontualidade reflete quando a
 * obrigação foi de fato quitada; se a última parcela atrasa, o mês conta como atraso.
 * Uma baixa com data vence uma sem data (backfill sem recibo) na disputa.
 */
function baixaRepresentativa(baixas: Payment[]): Payment | undefined {
  if (baixas.length === 0) return undefined
  return baixas.reduce((rep, p) => {
    if (rep.dataPagamento == null) return p
    if (p.dataPagamento == null) return rep
    return p.dataPagamento > rep.dataPagamento ? p : rep
  })
}

/** O farol do mês vigente (a ocorrência mais recente ≤ hoje) nos 4 estados. */
export function farolDoMes(
  bill: Bill,
  payments: Payment[],
  hoje: string,
  calendar: Calendar,
): FarolEstado {
  const competencia = ocorrenciasRecentes(bill.recurrence, mesDe(hoje), 1)[0]
  if (payments.some((p) => p.competencia === competencia)) return "verde"

  const vencimento = resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar)
  const dias = diffEmDias(hoje, vencimento)
  if (dias > LIMIAR_PROXIMIDADE_DIAS) return "cinza"
  if (dias >= 1) return "amarelo"
  return "vermelho" // vence hoje (0) ou já venceu (< 0)
}

/** O grid das últimas 12 ocorrências, cada uma com seu vencimento, estado e valor pago. */
export function gridOcorrencias(
  bill: Bill,
  payments: Payment[],
  hoje: string,
  calendar: Calendar,
): GridCelula[] {
  const comps = ocorrenciasRecentes(bill.recurrence, mesDe(hoje), OCORRENCIAS_NA_JANELA)
  return comps.map((competencia) => {
    const vencimento = resolverVencimento(bill.dueRule, bill.dueMonthOffset, competencia, calendar)
    // Ocorrência anterior à vigência da Conta (ADR-0011): fora-vigencia, nunca um
    // buraco em aberto. Lacuna de valor — a média/sparkline já a ignoram.
    if (competencia < bill.primeiraCompetencia) {
      return { competencia, vencimento, estado: "fora-vigencia" as const, valor: null }
    }
    // Baixa partida (CONTEXT.md #6): o valor da célula soma **todas** as baixas da
    // Competência; o estado sai da baixa representativa (a que completa o pagamento).
    const doMes = payments.filter((p) => p.competencia === competencia)
    return {
      competencia,
      vencimento,
      estado: estadoGrid(baixaRepresentativa(doMes), vencimento, hoje),
      valor: doMes.length > 0 ? doMes.reduce((soma, p) => soma + p.valor, 0) : null,
    }
  })
}

/**
 * Média 12 e sparkline sobre os valores pagos do grid. Mês sem pagamento é lacuna
 * (`null`), nunca zero; a média ignora as lacunas e é `null` quando não há
 * histórico. A média é uma interpretação derivada — arredonda ao centavo.
 */
export function resumoPagamentos(grid: GridCelula[]): {
  media: number | null
  sparkline: (number | null)[]
} {
  const sparkline = grid.map((c) => c.valor)
  const pagos = sparkline.filter((v): v is number => v != null)
  const media =
    pagos.length === 0 ? null : Math.round(pagos.reduce((soma, v) => soma + v, 0) / pagos.length)
  return { media, sparkline }
}

/**
 * Competência default da baixa (#63) a partir de um grid já derivado: a
 * ocorrência em aberto mais antiga — a Internet atrasada de junho baixa em
 * junho, não em julho (pagamento fora de ordem preserva a Competência certa).
 * Sem nenhuma em aberto, cai na ocorrência vigente (a última do grid). Só o
 * default; o campo é editável. Recebe o grid pronto (não recalcula) para a
 * borda reaproveitar o mesmo `derivarCardConta` de uma chamada só.
 */
export function competenciaDefaultBaixaDoGrid(grid: GridCelula[]): string {
  const emAberto = grid.find((celula) => celula.estado === "em-aberto")
  return (emAberto ?? grid[grid.length - 1]).competencia
}

/** Como `competenciaDefaultBaixaDoGrid`, mas deriva o grid a partir do `Clock`/`Calendar`. */
export function competenciaDefaultBaixa(
  clock: Clock,
  calendar: Calendar,
  bill: Bill,
  payments: Payment[],
): string {
  const grid = gridOcorrencias(bill, payments, clock.hoje(), calendar)
  return competenciaDefaultBaixaDoGrid(grid)
}

/**
 * Compõe o card inteiro da Conta a partir do `Clock` e do `Calendar` (os ports) e
 * dos fatos (a Conta e seus Lançamentos). A borda injeta os adapters reais; o
 * Seam 1 injeta os fakes.
 */
export function derivarCardConta(
  clock: Clock,
  calendar: Calendar,
  bill: Bill,
  payments: Payment[],
): CardConta {
  const hoje = clock.hoje()
  const grid = gridOcorrencias(bill, payments, hoje, calendar)
  const { media, sparkline } = resumoPagamentos(grid)
  return {
    vencimentoVigente: grid[grid.length - 1].vencimento,
    farol: farolDoMes(bill, payments, hoje, calendar),
    grid,
    media,
    sparkline,
  }
}
