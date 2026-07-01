import type { AreaEstado } from "./areas"

/**
 * Assunto (`Subject`) — recorte estrutural dentro de uma Área, com seu próprio
 * modelo (ADR-0009). É o Assunto — não a Área — que especializa os primitivos, e
 * Assuntos são disjuntos. Como a Área, é config declarada pelo produto (catálogo
 * estático), não dado do Lar, e tem ciclo de vida `em breve`/`ativa`.
 */
export type Subject = {
  slug: string
  nome: string
  icon: string
  estado: AreaEstado
  areaSlug: string
  resumo?: string
}

/**
 * Catálogo de Assuntos por Área. Pagamentos Recorrentes *é* a máquina
 * Conta/Lançamento de hoje re-parenteada sob o Assunto — zero migração de dado
 * (ADR-0009). Único Assunto `ativa` por ora; Investimentos virá `em breve`.
 */
export const SUBJECTS: Subject[] = [
  {
    slug: "pagamentos-recorrentes",
    nome: "Pagamentos Recorrentes",
    icon: "wallet",
    estado: "ativa",
    areaSlug: "financas",
    resumo: "Contas e Lançamentos do mês",
  },
  {
    slug: "investimentos",
    nome: "Investimentos",
    icon: "trending-up",
    estado: "em-breve",
    areaSlug: "financas",
    resumo: "Posições e aportes",
  },
]

/** Os Assuntos declarados de uma Área, na ordem do catálogo. */
export function assuntosDaArea(areaSlug: string): Subject[] {
  return SUBJECTS.filter((assunto) => assunto.areaSlug === areaSlug)
}

/**
 * Estado da Área derivado dos seus Assuntos (ADR-0009): `ativa` sse tem ≥1
 * Assunto `ativa`. Área sem Assunto declarado (as outras cinco) fica `em breve`.
 */
export function derivarEstadoArea(areaSlug: string, assuntos: Subject[] = SUBJECTS): AreaEstado {
  const temAtiva = assuntos.some(
    (assunto) => assunto.areaSlug === areaSlug && assunto.estado === "ativa",
  )
  return temAtiva ? "ativa" : "em-breve"
}
