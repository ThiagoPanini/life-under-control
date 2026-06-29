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
}

export const AREAS: Area[] = [
  { slug: "financas", nome: "Finanças", icon: "wallet", estado: "ativa" },
  { slug: "gastronomia", nome: "Gastronomia", icon: "chef-hat", estado: "em-breve" },
  { slug: "supermercado", nome: "Supermercado", icon: "shopping-cart", estado: "em-breve" },
  { slug: "saude", nome: "Saúde", icon: "heart-pulse", estado: "em-breve" },
  { slug: "imovel", nome: "Imóvel", icon: "house", estado: "em-breve" },
  { slug: "carro", nome: "Carro", icon: "car", estado: "em-breve" },
]
