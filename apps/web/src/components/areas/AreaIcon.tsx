import {
  Car,
  ChefHat,
  HeartPulse,
  House,
  type LucideIcon,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react"

/** Registro borda: nome do ícone (no catálogo do núcleo) → componente Lucide. */
const ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  "chef-hat": ChefHat,
  "shopping-cart": ShoppingCart,
  "heart-pulse": HeartPulse,
  house: House,
  car: Car,
  "trending-up": TrendingUp,
}

export function AreaIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Wallet
  return <Icon size={size} strokeWidth={1.6} aria-hidden />
}
