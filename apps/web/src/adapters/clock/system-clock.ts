import type { Clock } from "@/core/ports/clock"

/**
 * Adapter do `Clock` sobre o relógio do sistema, no fuso do domínio
 * (America/Sao_Paulo). `en-CA` formata como `YYYY-MM-DD` — a data civil que o
 * núcleo espera, sem hora nem timezone vazando para o domínio.
 */
export function systemClock(): Clock {
  return {
    hoje() {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
    },
  }
}
