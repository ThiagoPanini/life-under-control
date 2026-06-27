/**
 * Catálogo das Áreas da vida (núcleo puro — ADR-0003). É config estática: o
 * estado `ativa`/`em-breve` ainda NÃO é dado (ADR-0005/0006); por ora toda Área
 * nasce `em-breve`. O `icon` é só o nome do ícone (Lucide) — a borda resolve o
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
  { slug: "financas", nome: "Finanças", icon: "wallet", estado: "em-breve" },
  { slug: "gastronomia", nome: "Gastronomia", icon: "chef-hat", estado: "em-breve" },
  { slug: "supermercado", nome: "Supermercado", icon: "shopping-cart", estado: "em-breve" },
  { slug: "saude", nome: "Saúde", icon: "heart-pulse", estado: "em-breve" },
  { slug: "imovel", nome: "Imóvel", icon: "house", estado: "em-breve" },
  { slug: "carro", nome: "Carro", icon: "car", estado: "em-breve" },
]
