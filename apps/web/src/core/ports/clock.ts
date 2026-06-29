/**
 * Port do relógio (ADR-0003). O domínio trabalha em **datas civis** (YYYY-MM-DD),
 * não timestamps (CONTEXT.md #3): vencimento, competência e data de pagamento são
 * datas. Injetar o relógio torna "hoje" determinístico no teste (fake) e fixa o
 * fuso do Lar (America/Sao_Paulo) num só lugar no adapter real.
 */
export type Clock = {
  /** A data civil de hoje (YYYY-MM-DD) no fuso do domínio. */
  hoje(): string
}
