import type { PaymentProposal } from "@/core/domain/payment-proposal"
import type { PaymentProposalRepo } from "@/core/ports/payment-proposal-repo"

export type PaymentProposalRepoFake = PaymentProposalRepo & {
  /** As Propostas gravadas — inspecionável pelo teste. */
  propostas: PaymentProposal[]
}

/** Instante fixo do nascimento — o fake não tem relógio; determinismo no teste. */
const CRIADO_EM_FIXO = "2026-07-07T12:00:00.000Z"

export function fakePaymentProposalRepo(iniciais: PaymentProposal[] = []): PaymentProposalRepoFake {
  const propostas: PaymentProposal[] = [...iniciais]

  return {
    propostas,
    async criar(nova) {
      const proposta: PaymentProposal = { ...nova, estado: "proposta", criadoEm: CRIADO_EM_FIXO }
      propostas.push(proposta)
      return proposta
    },
    async obterAtivaPorHash(householdId, bytesHash) {
      return (
        propostas.find(
          (p) =>
            p.householdId === householdId &&
            p.bytesHash === bytesHash &&
            (p.estado === "proposta" || p.estado === "confirmada"),
        ) ?? null
      )
    },
  }
}
