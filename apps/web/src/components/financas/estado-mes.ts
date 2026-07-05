import type { EstadoMes } from "@/core/use-cases/derive-panorama-mensal"

/**
 * A leitura de apresentação de cada **estado do mês** (#93): rótulo, tom, pílula,
 * ponto e cor da frase. **Fonte única** compartilhada entre o card do Panorama
 * (#93) e a Visão Analítica por Conta (#127) — a pill de estado não se duplica
 * (invariante de apresentação do #127). Composição do protótipo Final: pílula com
 * borda no próprio tom (32%) e ponto **sólido** em todos os estados (a distinção
 * acessível vem do rótulo textual, sempre presente). `vencida` (vencimento
 * consumado) é o único que veste `danger`; `vence-em-breve` é atenção (âmbar);
 * `pago`/`a-vencer` repousam.
 */
export const ESTADO_MES: Record<
  EstadoMes,
  { label: string; tone: string; pill: string; dot: string; frase: string; aria: string }
> = {
  pago: {
    label: "pago",
    tone: "success",
    pill: "border-luc-success/[0.32] bg-luc-success/[0.09] text-luc-success",
    dot: "bg-luc-success",
    frase: "text-luc-muted",
    aria: "Conta paga no mês",
  },
  "a-vencer": {
    label: "a vencer",
    tone: "neutral",
    pill: "border-white/[0.13] bg-white/[0.05] text-luc-text-2",
    dot: "bg-luc-text-3",
    frase: "text-luc-muted",
    aria: "Conta a vencer, vencimento distante",
  },
  "vence-em-breve": {
    label: "vence em breve",
    tone: "warn",
    pill: "border-luc-warn/[0.32] bg-luc-warn/[0.09] text-luc-warn",
    dot: "bg-luc-warn",
    frase: "text-luc-warn",
    aria: "Conta vence em breve",
  },
  vencida: {
    label: "vencida",
    tone: "danger",
    pill: "border-luc-danger/[0.32] bg-luc-danger/[0.09] text-luc-danger",
    dot: "bg-luc-danger",
    frase: "text-luc-danger",
    aria: "Conta vencida",
  },
}
