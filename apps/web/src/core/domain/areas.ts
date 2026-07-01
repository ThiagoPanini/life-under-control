import { derivarEstadoArea } from "./subjects"

/**
 * Catálogo das Áreas da vida (núcleo puro — ADR-0003). É config estática de
 * produto; o `icon` é só o nome do ícone (Lucide) — a borda resolve o
 * componente; o núcleo não conhece React nem Lucide.
 *
 * O estado `ativa`/`em-breve` NÃO é fato declarado aqui: deriva dos Assuntos da
 * Área (ADR-0009) — `ativa` sse tem ≥1 Assunto `ativa`. Finanças fica `ativa`
 * porque declara Pagamentos Recorrentes; as demais, sem Assunto, ficam `em-breve`.
 */

export type AreaEstado = "ativa" | "em-breve"

export type Area = {
  slug: string
  nome: string
  icon: string
  estado: AreaEstado
  resumo?: string
}

/** Identidade e apresentação de cada Área. O estado é derivado abaixo, não fixado aqui. */
const CATALOGO: Omit<Area, "estado">[] = [
  {
    slug: "financas",
    nome: "Finanças",
    icon: "wallet",
    resumo: "Contas e Lançamentos do mês",
  },
  {
    slug: "gastronomia",
    nome: "Gastronomia",
    icon: "chef-hat",
    resumo: "Restaurantes e cafés indicados",
  },
  {
    slug: "supermercado",
    nome: "Supermercado",
    icon: "shopping-cart",
    resumo: "Lista de compras do mês",
  },
  {
    slug: "saude",
    nome: "Saúde",
    icon: "heart-pulse",
    resumo: "Consultas, exames e métricas do corpo",
  },
  {
    slug: "imovel",
    nome: "Imóvel",
    icon: "house",
    resumo: "Manutenção, reformas e documentos",
  },
  {
    slug: "carro",
    nome: "Carro",
    icon: "car",
    resumo: "Revisões, abastecimento e seguro",
  },
]

export const AREAS: Area[] = CATALOGO.map((area) => ({
  ...area,
  estado: derivarEstadoArea(area.slug),
}))
