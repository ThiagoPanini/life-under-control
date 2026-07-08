import type { Bill } from "@/core/domain/bill"
import { formatBRLSemCentavos } from "@/core/domain/money"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import { derivarTiraAtencao, type ItemAtencao } from "./derive-atencao"

/**
 * Os três parâmetros do template utility `digest_vencimentos` (#157), na ordem
 * do corpo aprovado. Cada um é uma linha só — a Meta proíbe param vazio ou
 * multi-linha; a lista de Contas vive inline separada por `", "`, e um bucket
 * sem Conta vira o placeholder literal `"nenhuma"`.
 */
export type ParamsDigest = {
  /** `{{1}}` — Contas vencidas (farol vermelho, inclui "vence hoje" — ver adjudicação abaixo). */
  vencidas: string
  /** `{{2}}` — Contas que vencem em breve (farol amarelo, 1..3 dias). */
  venceEmBreve: string
  /** `{{3}}` — total estimado (`≈ R$ …`) ou `"sem estimativa"` quando nenhum item tem histórico. */
  totalEstimado: string
}

/**
 * O conteúdo do digest de vencimentos derivado na hora (invariante #3: nada de
 * estado de vencimento persistido). `enviar: false` = nenhuma Conta pede atenção
 * → ADR-0012 manda não enviar mensagem.
 */
export type ConteudoDigest = { enviar: false } | { enviar: true; params: ParamsDigest }

const PLACEHOLDER_BUCKET_VAZIO = "nenhuma"
const PLACEHOLDER_SEM_ESTIMATIVA = "sem estimativa"
/**
 * Teto defensivo do tamanho de um parâmetro de body. A Meta recusa params muito
 * longos (e proíbe multi-linha); com muitas Contas vencidas a lista poderia
 * estourar. Bem abaixo do limite real (~1024) pra sobrar folga.
 */
const MAX_PARAM = 900

/**
 * Achata o título numa linha só: a Meta proíbe quebra de linha, tab e 4+ espaços
 * num parâmetro (#157). Um nome de Conta importado pode trazer `\n` — colapsa
 * todo espaço em branco num espaço simples e apara as pontas.
 */
function sanitizarTitulo(titulo: string): string {
  return titulo.replace(/\s+/g, " ").trim()
}

/** `Título ≈ R$ valor`, ou só o título quando a Conta não tem histórico (nunca `R$ 0` disfarçado). */
function formatarItem(item: ItemAtencao): string {
  const titulo = sanitizarTitulo(item.titulo)
  if (item.valorEstimado == null) return titulo
  return `${titulo} ≈ ${formatBRLSemCentavos(item.valorEstimado)}`
}

/** Trunca com reticências se o parâmetro estourar o teto da Meta (backstop). */
function limitarParam(texto: string): string {
  return texto.length <= MAX_PARAM ? texto : `${texto.slice(0, MAX_PARAM - 1).trimEnd()}…`
}

function formatarBucket(itens: ItemAtencao[]): string {
  if (itens.length === 0) return PLACEHOLDER_BUCKET_VAZIO
  return limitarParam(itens.map(formatarItem).join(", "))
}

/**
 * Deriva o conteúdo do digest diário de vencimentos (#160, fase 2) a partir da
 * mesma derivação de atenção do portal (`derivarTiraAtencao`) — sem estado novo.
 * Os buckets seguem o farol da ocorrência: `{{1}}` vencidas (vermelho, inclui
 * "vence hoje"), `{{2}}` vencem em breve (amarelo).
 *
 * Adjudicação da divergência glossário × código (AC de #160): o farol vem do
 * código atual (`LIMIAR_PROXIMIDADE_DIAS = 3`; "vence hoje" = vermelho), que
 * governa o farol do portal inteiro — o digest apenas o expõe no WhatsApp, sem
 * corrigir em silêncio. Mudar o limiar (glossário: 4 dias, "vence hoje" âmbar) é
 * issue própria com aval do operador, pois mexe na tira de atenção e nos cards.
 */
export function derivarConteudoDigest(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): ConteudoDigest {
  const tira = derivarTiraAtencao(clock, calendar, bills, payments)
  if (tira.estado === "calma") return { enviar: false }

  const vencidas = tira.itens.filter((item) => item.farol === "vermelho")
  const venceEmBreve = tira.itens.filter((item) => item.farol === "amarelo")

  return {
    enviar: true,
    params: {
      vencidas: formatarBucket(vencidas),
      venceEmBreve: formatarBucket(venceEmBreve),
      totalEstimado:
        tira.totalEstimado == null
          ? PLACEHOLDER_SEM_ESTIMATIVA
          : `≈ ${formatBRLSemCentavos(tira.totalEstimado)}`,
    },
  }
}
