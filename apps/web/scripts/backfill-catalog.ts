/**
 * Catálogo do backfill histórico (issue #24) — a config da borda de ingestão, fora
 * do núcleo. Mapeia cada categoria da planilha de controle do Lar à Conta (Bill) a
 * cadastrar, a quem atribuir os Lançamentos (paidBy) e a pasta de comprovantes que
 * a alimenta. Os ids do Lar e das Pessoas são os fixos do seed (`drizzle/seed.sql`).
 *
 * Os defaults de vencimento são um chute razoável (o operador ajusta no portal —
 * #21): a planilha não guarda o dia de vencimento, só competência/valor/status.
 */

/** O Lar "Casa Panini" (seed). */
export const HOUSEHOLD = "00000000-0000-0000-0000-000000000001"
/** Thiago (seed). */
export const THIAGO = "00000000-0000-0000-0000-00000000000a"
/** Jakeline (seed). */
export const JAKELINE = "00000000-0000-0000-0000-00000000000b"

/** A raiz dos comprovantes no disco do operador (sobrescreve via env `RECIBOS_ROOT`). */
export const RECIBOS_ROOT_DEFAULT =
  "/mnt/c/Users/panin/OneDrive/docs/ap/compra/apto-ideale-demarchi/7.pagamentos-recorrentes"

/** Uma Conta do catálogo: como cadastrá-la e o que a alimenta. */
export type ContaCatalogo = {
  /** O rótulo da categoria na planilha, **sem o emoji** (ex.: "Condomínio", "Celular Thi"). */
  label: string
  /** Nome da Conta no portal. */
  nome: string
  /** Ícone (subconjunto Lucide — ver `BILL_ICONS`). */
  icon: string
  /** Dia do vencimento (default; o operador ajusta). */
  dueDay: number
  /** Offset de mês do vencimento (condomínio vence na competência +1). */
  dueMonthOffset: number
  /** A Pessoa a quem atribuir os Lançamentos desta Conta. */
  paidBy: string
  /** A pasta de comprovantes que alimenta esta Conta; `null` quando não há recibos. */
  dirSlug: string | null
  /**
   * Defasagem **permanente** de nomenclatura da raiz legada (#124): o nome do
   * arquivo gravou historicamente a competência −N (Competência = mês do
   * vencimento — decisão de 04/07/2026). Os originais no OneDrive ficam
   * intocados para sempre; toda leitura da raiz legada traduz nome→competência
   * somando este offset. Raiz corrigida (marcador `.competencia-corrigida.json`
   * presente) lê sem tradução — guarda anti-double-shift. Ausente = 0.
   */
  offsetNomeLegado?: number
}

/**
 * As 10 Contas da planilha. `dirSlug` aponta a pasta de comprovantes (`luz` guarda
 * `conta-luz-*`); `plano-celular` alimenta só o Celular do Thiago (a pasta é um
 * fluxo só — o Celular da Jake fica "pago sem data"). Cartões não têm recibo.
 */
export const CATALOGO: ContaCatalogo[] = [
  {
    label: "Condomínio",
    nome: "Condomínio",
    icon: "building-2",
    dueDay: 10,
    dueMonthOffset: 1,
    paidBy: THIAGO,
    dirSlug: "condominio",
    // Confirmado pela assinatura de timing (28/33 pagamentos no mês seguinte ao do
    // nome): o boleto de julho sempre foi salvo como junho. Nome + 1 = competência.
    offsetNomeLegado: 1,
  },
  {
    label: "Luz",
    nome: "Luz",
    icon: "zap",
    dueDay: 15,
    dueMonthOffset: 0,
    paidBy: THIAGO,
    dirSlug: "luz",
  },
  {
    label: "Gás",
    nome: "Gás",
    icon: "flame",
    dueDay: 15,
    dueMonthOffset: 0,
    paidBy: THIAGO,
    dirSlug: "gas",
    // Suspeita de defasagem (16/29 pagamentos no mês seguinte) — o Gate 1 da #125
    // decide pelo vencimento impresso; se shiftar, o offset legado entra aqui.
  },
  {
    label: "Internet",
    nome: "Internet",
    icon: "wifi",
    dueDay: 20,
    dueMonthOffset: 0,
    paidBy: THIAGO,
    dirSlug: "internet",
  },
  {
    label: "IPTU",
    nome: "IPTU",
    icon: "home",
    dueDay: 10,
    dueMonthOffset: 0,
    paidBy: THIAGO,
    dirSlug: "iptu",
  },
  {
    label: "Celular Thi",
    nome: "Celular Thiago",
    icon: "smartphone",
    dueDay: 15,
    dueMonthOffset: 0,
    paidBy: THIAGO,
    dirSlug: "plano-celular",
  },
  {
    label: "Celular Jake",
    nome: "Celular Jakeline",
    icon: "smartphone",
    dueDay: 15,
    dueMonthOffset: 0,
    paidBy: JAKELINE,
    dirSlug: null,
  },
  {
    label: "Cartão Thi",
    nome: "Cartão Thiago",
    icon: "credit-card",
    dueDay: 10,
    dueMonthOffset: 0,
    paidBy: THIAGO,
    dirSlug: null,
  },
  {
    label: "Cartão Jake",
    nome: "Cartão Jakeline",
    icon: "credit-card",
    dueDay: 10,
    dueMonthOffset: 0,
    paidBy: JAKELINE,
    dirSlug: null,
  },
  {
    label: "DAS Jake",
    nome: "DAS Jakeline",
    icon: "receipt",
    dueDay: 20,
    dueMonthOffset: 0,
    paidBy: JAKELINE,
    dirSlug: "das",
  },
]

/**
 * Reduz a categoria da planilha à sua chave: remove o emoji/símbolo do início e
 * apara. `"☢️ Gás "` → `"Gás"`, `"📞 Celular Thi"` → `"Celular Thi"`. Casa com o
 * `label` do catálogo sem depender dos bytes exatos do emoji.
 */
export function chaveCategoria(categoria: string): string {
  return categoria.replace(/^[^\p{L}]+/u, "").trim()
}

/** Deriva o tipo MIME do comprovante pela extensão do arquivo. */
export function tipoMimeDe(arquivo: string): string {
  const ext = arquivo.toLowerCase().split(".").pop() ?? ""
  if (ext === "pdf") return "application/pdf"
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  return "image/jpeg"
}
