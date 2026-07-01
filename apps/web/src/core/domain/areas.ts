/**
 * Catálogo das Áreas da vida (núcleo puro — ADR-0003). É config estática: o
 * estado `ativa`/`em-breve` é faseamento de produto (ADR-0006), não dado do Lar.
 * Finanças é a 1ª Área `ativa` (PRD #16); as demais seguem `em-breve` até serem
 * trabalhadas. O `icon` é só o nome do ícone (Lucide) — a borda resolve o
 * componente; o núcleo não conhece React nem Lucide.
 */

export type AreaEstado = "ativa" | "em-breve"

export type Area = {
  slug: string
  nome: string
  icon: string
  estado: AreaEstado
  resumo?: string
}

export const AREAS: Area[] = [
  {
    slug: "financas",
    nome: "Finanças",
    icon: "wallet",
    estado: "ativa",
    resumo: "Contas e Lançamentos do mês",
  },
  {
    slug: "gastronomia",
    nome: "Gastronomia",
    icon: "chef-hat",
    estado: "em-breve",
    resumo: "Restaurantes e cafés indicados",
  },
  {
    slug: "supermercado",
    nome: "Supermercado",
    icon: "shopping-cart",
    estado: "em-breve",
    resumo: "Lista de compras do mês",
  },
  {
    slug: "saude",
    nome: "Saúde",
    icon: "heart-pulse",
    estado: "em-breve",
    resumo: "Consultas, exames e métricas do corpo",
  },
  {
    slug: "imovel",
    nome: "Imóvel",
    icon: "house",
    estado: "em-breve",
    resumo: "Manutenção, reformas e documentos",
  },
  {
    slug: "carro",
    nome: "Carro",
    icon: "car",
    estado: "em-breve",
    resumo: "Revisões, abastecimento e seguro",
  },
]
