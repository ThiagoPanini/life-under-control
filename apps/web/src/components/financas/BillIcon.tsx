import {
  Building2,
  Car,
  CreditCard,
  Droplet,
  Dumbbell,
  Flame,
  GraduationCap,
  HeartPulse,
  Home,
  type LucideIcon,
  Receipt,
  Shield,
  Smartphone,
  Tv,
  Wifi,
  Zap,
} from "lucide-react"

/** Registro borda: nome do ícone (catálogo `BILL_ICONS` do núcleo) → componente Lucide. */
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  "building-2": Building2,
  zap: Zap,
  flame: Flame,
  droplet: Droplet,
  wifi: Wifi,
  smartphone: Smartphone,
  tv: Tv,
  "credit-card": CreditCard,
  receipt: Receipt,
  car: Car,
  shield: Shield,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  dumbbell: Dumbbell,
}

export function BillIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Receipt
  return <Icon size={size} strokeWidth={1.6} aria-hidden />
}
