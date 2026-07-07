import type { NovaPaymentProposal, PaymentProposal } from "../domain/payment-proposal"

/**
 * `criar` colidiu com uma Proposta **ativa** de mesmo hash (o índice único
 * parcial do banco decidiu, fechando a corrida check-then-insert entre duas
 * entregas concorrentes do mesmo arquivo). A borda trata como repetição —
 * avisa referenciando a existente, não duplica.
 */
export class PropostaDuplicadaError extends Error {
  constructor(readonly bytesHash: string) {
    super("Já existe uma Proposta ativa para este comprovante")
    this.name = "PropostaDuplicadaError"
  }
}

/**
 * Port de persistência da Proposta de Lançamento (ADR-0003, ADR-0012, issue
 * #158). Estado de borda/adapter (a tabela `whatsapp_proposals`), não primitivo
 * de domínio (ADR-0005): a Proposta nomeia o transitório para não contaminar o
 * Lançamento. Escopado por `householdId` (o Lar) — acesso simétrico (#1).
 */
export type PaymentProposalRepo = {
  /**
   * Grava uma Proposta nova (nasce no estado `proposta`) e devolve a forma de
   * domínio. Lança `PropostaDuplicadaError` se já há Proposta ativa de mesmo
   * `(householdId, bytesHash)` — o índice único parcial fecha a corrida.
   */
  criar(nova: NovaPaymentProposal): Promise<PaymentProposal>
  /**
   * Acha a Proposta **ativa** (estado `proposta` ou `confirmada`) do Lar com o
   * mesmo hash de bytes — a detecção de comprovante repetido (mesmo arquivo). O
   * mesmo hash em Proposta aberta ou já virada Lançamento gera aviso, não
   * duplicata; `cancelada`/`expirada` não conta (reenviar depois de cancelar
   * abre uma Proposta nova). `null` se não há repetição ativa.
   */
  obterAtivaPorHash(householdId: string, bytesHash: string): Promise<PaymentProposal | null>
}
