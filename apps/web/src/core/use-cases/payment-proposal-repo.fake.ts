import { ESTADOS_PROPOSTA_ATIVA, type PaymentProposal } from "@/core/domain/payment-proposal"
import {
  type PaymentProposalRepo,
  PropostaDuplicadaError,
} from "@/core/ports/payment-proposal-repo"

export type PaymentProposalRepoFake = PaymentProposalRepo & {
  /** As Propostas gravadas — inspecionável pelo teste. */
  propostas: PaymentProposal[]
}

/** Instante fixo do nascimento — o fake não tem relógio; determinismo no teste. */
const CRIADO_EM_FIXO = "2026-07-07T12:00:00.000Z"

export function fakePaymentProposalRepo(iniciais: PaymentProposal[] = []): PaymentProposalRepoFake {
  const propostas: PaymentProposal[] = [...iniciais]

  function ativaPorHash(householdId: string, bytesHash: string): PaymentProposal | null {
    return (
      propostas.find(
        (p) =>
          p.householdId === householdId &&
          p.bytesHash === bytesHash &&
          ESTADOS_PROPOSTA_ATIVA.includes(p.estado),
      ) ?? null
    )
  }

  return {
    propostas,
    async criar(nova) {
      // Espelha o índice único parcial do banco: no máximo uma ativa por (Lar, hash).
      if (ativaPorHash(nova.householdId, nova.bytesHash)) {
        throw new PropostaDuplicadaError(nova.bytesHash)
      }
      const proposta: PaymentProposal = { ...nova, estado: "proposta", criadoEm: CRIADO_EM_FIXO }
      propostas.push(proposta)
      return proposta
    },
    async obterAtivaPorHash(householdId, bytesHash) {
      return ativaPorHash(householdId, bytesHash)
    },
  }
}
