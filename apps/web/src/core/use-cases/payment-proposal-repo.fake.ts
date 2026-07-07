import {
  ESTADOS_PROPOSTA_ATIVA,
  type EstadoProposta,
  type PaymentProposal,
} from "@/core/domain/payment-proposal"
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

  function transicao(
    householdId: string,
    id: string,
    de: EstadoProposta,
    para: EstadoProposta,
  ): PaymentProposal | null {
    const p = propostas.find((x) => x.householdId === householdId && x.id === id)
    if (!p || p.estado !== de) return null
    p.estado = para
    return p
  }

  return {
    propostas,
    async criar(nova) {
      // Espelha o índice único parcial do banco: no máximo uma ativa por (Lar, hash).
      if (ativaPorHash(nova.householdId, nova.bytesHash)) {
        throw new PropostaDuplicadaError(nova.bytesHash)
      }
      const proposta: PaymentProposal = {
        ...nova,
        estado: "proposta",
        criadoEm: CRIADO_EM_FIXO,
        aguardandoCampo: null,
        aguardandoPor: null,
      }
      propostas.push(proposta)
      return proposta
    },
    async obterAtivaPorHash(householdId, bytesHash) {
      return ativaPorHash(householdId, bytesHash)
    },
    async obterPorId(householdId, id) {
      return propostas.find((p) => p.householdId === householdId && p.id === id) ?? null
    },
    async confirmar(householdId, id) {
      return transicao(householdId, id, "proposta", "confirmada")
    },
    async cancelar(householdId, id) {
      return transicao(householdId, id, "proposta", "cancelada")
    },
    async marcarExpirada(householdId, id) {
      return transicao(householdId, id, "proposta", "expirada")
    },
    async atualizarConta(householdId, id, billId, competencia) {
      const p = propostas.find((x) => x.householdId === householdId && x.id === id)
      if (p?.estado !== "proposta") return null
      p.billId = billId
      p.competencia = competencia
      return p
    },
    async atualizarCompetencia(householdId, id, competencia) {
      const p = propostas.find((x) => x.householdId === householdId && x.id === id)
      if (p?.estado !== "proposta") return null
      p.competencia = competencia
      return p
    },
    async atualizarCampo(householdId, id, patch) {
      const p = propostas.find((x) => x.householdId === householdId && x.id === id)
      if (p?.estado !== "proposta") return null
      if (patch.valorCentavos !== undefined) p.valorCentavos = patch.valorCentavos
      if (patch.dataPagamento !== undefined) p.dataPagamento = patch.dataPagamento
      if (patch.favorecido !== undefined) p.favorecido = patch.favorecido
      p.aguardandoCampo = null
      p.aguardandoPor = null
      return p
    },
    async definirAguardando(householdId, id, campo, pessoa) {
      const p = propostas.find((x) => x.householdId === householdId && x.id === id)
      if (p?.estado !== "proposta") return null
      // Um slot por Pessoa, na ordem certa (#178): seta o alvo PRIMEIRO; só então
      // libera qualquer outra edição pendente dela. Limpar antes arriscaria zerar a
      // pendência de outra Proposta se o set no alvo não pegasse (aqui não pega se
      // não estiver `proposta`) — o CAS é o ponto de commit.
      p.aguardandoCampo = campo
      p.aguardandoPor = pessoa
      for (const outra of propostas) {
        if (outra.householdId === householdId && outra.aguardandoPor === pessoa && outra !== p) {
          outra.aguardandoCampo = null
          outra.aguardandoPor = null
        }
      }
      return p
    },
    async obterAguardandoPor(householdId, pessoa) {
      return (
        propostas.find(
          (p) =>
            p.householdId === householdId &&
            p.estado === "proposta" &&
            p.aguardandoPor === pessoa &&
            p.aguardandoCampo !== null,
        ) ?? null
      )
    },
    async limparAguardando(householdId, pessoa) {
      for (const p of propostas) {
        if (p.householdId === householdId && p.aguardandoPor === pessoa) {
          p.aguardandoCampo = null
          p.aguardandoPor = null
        }
      }
    },
    async listarAbertas() {
      return propostas.filter((p) => p.estado === "proposta")
    },
  }
}
