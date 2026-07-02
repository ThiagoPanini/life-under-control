/**
 * Conta (`Bill`) — núcleo puro (ADR-0003). A instância do Gerador em Finanças
 * (ADR-0005): a *regra* de um pagamento que se repete. Guarda nome, ícone,
 * descrição, **Recorrência** e **regra de vencimento esperado** — e nunca um
 * valor (invariante #5 do CONTEXT.md: a Conta projeta o "quando", jamais o
 * "quanto"). Aqui só há tipos e derivações puras; nada de Drizzle, Next ou React.
 *
 * Sem derivações datadas nesta fatia (#17): o vencimento esperado resolvido, o
 * farol e o grid chegam com o card (#21). Aqui a Conta só nasce e se descreve.
 */

/** Estado de vida da Conta: `ativa` projeta; `encerrada` cessa e guarda histórico. */
export type BillEstado = "ativa" | "encerrada"

/** Forma da regra de vencimento esperado (sem a data — derivada depois, #21). */
export type DueRuleKind = "dia-fixo" | "n-esimo-dia-util" | "ultimo-dia-util"

/**
 * Regra de vencimento esperado: a *forma* de resolver o dia da ocorrência.
 * `dia-fixo` cai num dia do mês; `n-esimo-dia-util` no N-ésimo dia útil;
 * `ultimo-dia-util` no último dia útil. O offset de mês mora na Conta, não aqui.
 */
export type DueRule =
  | { kind: "dia-fixo"; day: number }
  | { kind: "n-esimo-dia-util"; nth: number }
  | { kind: "ultimo-dia-util" }

/**
 * Recorrência: a cada `intervalMonths` meses. `anchorMonth` (1–12) fixa em quais
 * meses as ocorrências caem quando o intervalo > 1 (bimestral/anual…); mensal
 * não precisa de âncora, então é `null`.
 */
export type Recurrence = {
  intervalMonths: number
  anchorMonth: number | null
}

/** Os dados editáveis de uma Conta pela Pessoa — a forma já validada e normalizada. */
export type DadosBill = {
  nome: string
  descricao: string | null
  icon: string
  recurrence: Recurrence
  dueRule: DueRule
  /** Offset de mês: a ocorrência vence na competência + N meses (default 0; condomínio +1). */
  dueMonthOffset: number
}

/** Uma Conta persistida: os dados + identidade e dono (o Lar) + estado de vida. */
export type Bill = DadosBill & {
  id: string
  householdId: string
  estado: BillEstado
  /** Data civil (YYYY-MM-DD) em que a Conta foi encerrada; `null` enquanto `ativa`. */
  encerradaEm: string | null
  /** Chave do logo no bucket R2 (ADR-0008); `null` sem logo — o `icon` é o fallback. */
  logoKey: string | null
}

/** Entrada crua do cadastro (strings/números possivelmente inválidos da borda). */
export type BillBruto = {
  nome: string
  descricao?: string | null
  icon: string
  intervalMonths: number
  anchorMonth?: number | null
  dueRuleKind: string
  dueRuleDay?: number | null
  dueRuleNth?: number | null
  dueMonthOffset?: number | null
}

/** Erro de validação amarrado a um campo, para a borda destacar o input certo. */
export type ErroCampo = { campo: string; mensagem: string }

export type ValidacaoBill = { ok: true; value: DadosBill } | { ok: false; erros: ErroCampo[] }

/**
 * Catálogo de ícones de Conta (subconjunto Lucide; só os nomes — a borda resolve
 * o componente, o núcleo não conhece React). Cresce conforme a vida do Lar pedir.
 */
export const BILL_ICONS = [
  "home",
  "building-2",
  "zap",
  "flame",
  "droplet",
  "wifi",
  "smartphone",
  "tv",
  "credit-card",
  "receipt",
  "car",
  "shield",
  "heart-pulse",
  "graduation-cap",
  "dumbbell",
] as const

/** Meses em pt-BR (índice 0 = janeiro), para descrever Recorrência e âncora. */
export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

/** Abreviação pt-BR de mês (índice 0 = jan), pro rótulo compacto de competência/eixo. */
export const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
]

/** Mês abreviado de uma competência (`YYYY-MM` → `"jan"`). */
export function mesCurto(competencia: string): string {
  return MESES_CURTOS[Number(competencia.slice(5, 7)) - 1]
}

/** Mês curto + ano de 2 dígitos ("2026-06" → "jun/26") — eixo de gráfico por competência. */
export function mesAno(competencia: string): string {
  return `${mesCurto(competencia)}/${competencia.slice(2, 4)}`
}

/** Nome pt-BR de cada periodicidade conhecida (intervalo em meses → rótulo). */
export const RECORRENCIA_NOMES: Record<number, string> = {
  1: "Mensal",
  2: "Bimestral",
  3: "Trimestral",
  6: "Semestral",
  12: "Anual",
}

/** Periodicidades oferecidas no cadastro (a ordem é a do wizard). */
export const PERIODICIDADES_PADRAO = [1, 2, 3, 6, 12] as const

const NOME_MAX = 80
const DESCRICAO_MAX = 280
const INTERVALO_MAX = 120
/** Um mês civil tem no máximo ~23 dias úteis; acima disso, use `ultimo-dia-util`. */
const NTH_MAX = 23
const OFFSET_MAX = 12

function ehInteiroNoIntervalo(n: unknown, min: number, max: number): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max
}

/**
 * Valida e normaliza o cadastro de uma Conta. Fonte única da regra: o use-case
 * `createBill` (o portão) e o wizard (a borda) consomem isto. Normaliza ao
 * passar (trim do nome, descrição vazia → `null`, âncora irrelevante → `null`,
 * offset ausente → 0) e monta a união discriminada de `DueRule`.
 */
export function validarDadosBill(bruto: BillBruto): ValidacaoBill {
  const erros: ErroCampo[] = []

  const nome = (bruto.nome ?? "").trim()
  if (!nome) erros.push({ campo: "nome", mensagem: "Dê um nome à Conta." })
  else if (nome.length > NOME_MAX)
    erros.push({ campo: "nome", mensagem: `Nome muito longo (máx. ${NOME_MAX}).` })

  const descricaoTrim = (bruto.descricao ?? "").trim()
  if (descricaoTrim.length > DESCRICAO_MAX)
    erros.push({ campo: "descricao", mensagem: `Descrição muito longa (máx. ${DESCRICAO_MAX}).` })
  const descricao = descricaoTrim || null

  const icon = bruto.icon
  if (!BILL_ICONS.includes(icon as (typeof BILL_ICONS)[number]))
    erros.push({ campo: "icon", mensagem: "Escolha um ícone." })

  const intervalMonths = bruto.intervalMonths
  if (!ehInteiroNoIntervalo(intervalMonths, 1, INTERVALO_MAX))
    erros.push({ campo: "intervalMonths", mensagem: "Periodicidade inválida." })

  // Âncora só faz sentido quando o intervalo > 1; mensal ignora o valor.
  let anchorMonth: number | null = null
  if (intervalMonths > 1) {
    if (ehInteiroNoIntervalo(bruto.anchorMonth, 1, 12)) anchorMonth = bruto.anchorMonth as number
    else erros.push({ campo: "anchorMonth", mensagem: "Escolha o mês-âncora." })
  }

  let dueRule: DueRule | null = null
  switch (bruto.dueRuleKind) {
    case "dia-fixo":
      if (ehInteiroNoIntervalo(bruto.dueRuleDay, 1, 31))
        dueRule = { kind: "dia-fixo", day: bruto.dueRuleDay as number }
      else erros.push({ campo: "dueRuleDay", mensagem: "Dia do mês entre 1 e 31." })
      break
    case "n-esimo-dia-util":
      if (ehInteiroNoIntervalo(bruto.dueRuleNth, 1, NTH_MAX))
        dueRule = { kind: "n-esimo-dia-util", nth: bruto.dueRuleNth as number }
      else erros.push({ campo: "dueRuleNth", mensagem: `N-ésimo dia útil entre 1 e ${NTH_MAX}.` })
      break
    case "ultimo-dia-util":
      dueRule = { kind: "ultimo-dia-util" }
      break
    default:
      erros.push({ campo: "dueRuleKind", mensagem: "Forma de vencimento inválida." })
  }

  const dueMonthOffset = bruto.dueMonthOffset ?? 0
  if (!ehInteiroNoIntervalo(dueMonthOffset, 0, OFFSET_MAX))
    erros.push({ campo: "dueMonthOffset", mensagem: `Offset de mês entre 0 e ${OFFSET_MAX}.` })

  // dueRule só fica null quando a forma é desconhecida (o `default` já registrou
  // o erro) ou quando o parâmetro está fora de faixa (a `case` já registrou o
  // erro do campo). Logo, basta narrow + checar a lista — sem re-empurrar erro.
  if (!dueRule || erros.length > 0) return { ok: false, erros }

  return {
    ok: true,
    value: {
      nome,
      descricao,
      icon,
      recurrence: { intervalMonths, anchorMonth },
      dueRule,
      dueMonthOffset,
    },
  }
}

/** Descreve a Recorrência em pt-BR para a lista ("Mensal", "Anual · Janeiro"). */
export function descreverRecorrencia(r: Recurrence): string {
  const base = RECORRENCIA_NOMES[r.intervalMonths] ?? `A cada ${r.intervalMonths} meses`
  if (r.intervalMonths > 1 && r.anchorMonth) return `${base} · ${MESES[r.anchorMonth - 1]}`
  return base
}

/** Mês da Competência por extenso, minúsculo (bloco Competência, #58): "2026-07" → "julho de 2026". */
export function descreverMesPorExtenso(competencia: string): string {
  const [ano, mes] = competencia.split("-")
  return `${MESES[Number(mes) - 1].toLowerCase()} de ${ano}`
}

/** Descreve a regra de vencimento em pt-BR ("Vence dia 10", "5º dia útil (competência +1)"). */
export function descreverVencimento(dueRule: DueRule, dueMonthOffset: number): string {
  let base: string
  switch (dueRule.kind) {
    case "dia-fixo":
      base = `Vence dia ${dueRule.day}`
      break
    case "n-esimo-dia-util":
      base = `${dueRule.nth}º dia útil`
      break
    case "ultimo-dia-util":
      base = "Último dia útil"
      break
  }
  if (dueMonthOffset > 0)
    return `${base} (competência +${dueMonthOffset} ${dueMonthOffset === 1 ? "mês" : "meses"})`
  return base
}

const DATA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * É uma data civil ISO (`YYYY-MM-DD`) real? O domínio trabalha em datas civis,
 * não timestamps (CONTEXT.md). Rejeita formato torto, mês fora de 1–12 e dia
 * inexistente (29/02 em ano comum, 31 de mês curto) — round-trip por `Date.UTC`.
 */
export function ehDataIsoValida(s: string): boolean {
  if (!DATA_ISO_RE.test(s)) return false
  const [ano, mes, dia] = s.split("-").map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

/** Formata uma data civil ISO em pt-BR (`2026-06-29` → `29/06/2026`). */
export function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}

const PREFIXO_LOGO = "finance/bills"

/**
 * Deriva a chave de um logo de Conta no bucket R2:
 * `finance/bills/{lar}/{conta}/{upload}`. Chave **por upload** (como
 * `chaveComprovante`), não fixa por Conta: trocar assina um objeto novo, então
 * o logo anterior segue intacto até a confirmação suceder — só então é
 * limpo. Uma chave fixa reescreveria o logo em uso antes da confirmação
 * validar o upload, destruindo-o se a confirmação falhasse no meio do caminho.
 */
export function chaveLogoBill(householdId: string, billId: string, uploadId: string): string {
  return `${PREFIXO_LOGO}/${householdId}/${billId}/${uploadId}`
}
