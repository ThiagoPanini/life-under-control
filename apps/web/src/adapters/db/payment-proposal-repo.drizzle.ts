import { and, desc, eq, inArray } from "drizzle-orm"
import {
  ESTADOS_PROPOSTA_ATIVA,
  type EstadoProposta,
  type PaymentProposal,
} from "@/core/domain/payment-proposal"
import type { PaymentProposalRepo } from "@/core/ports/payment-proposal-repo"
import { PropostaDuplicadaError } from "@/core/ports/payment-proposal-repo"
import { type Db, getDb } from "./client"
import { ehViolacaoDeUnicidade } from "./postgres-error"
import { whatsappProposals } from "./schema"

/** Teto de Propostas abertas lidas por passe de varredura (limpeza oportunista, não relatório). */
const MAX_VARREDURA = 200

function paraDominio(r: typeof whatsappProposals.$inferSelect): PaymentProposal {
  return {
    id: r.id,
    householdId: r.householdId,
    waMessageId: r.waMessageId,
    bytesHash: r.bytesHash,
    paidBy: r.paidBy,
    billId: r.billId,
    valorCentavos: r.valorCentavos,
    dataPagamento: r.dataPagamento,
    competencia: r.competencia,
    favorecido: r.favorecido,
    stagingKey: r.stagingKey,
    tipoMime: r.tipoMime,
    estado: r.estado as EstadoProposta,
    criadoEm: r.criadoEm.toISOString(),
  }
}

/** Adapter Drizzle da Proposta de Lançamento (ADR-0003, ADR-0012, issues #158/#159). */
export function drizzleWhatsappProposalRepo(db: Db = getDb()): PaymentProposalRepo {
  // Transição CAS de estado: o UPDATE só casa se o estado atual for `de`; o
  // RETURNING vazio (null) é a trava — dois cliques concorrentes, só um vence.
  async function transicao(
    householdId: string,
    id: string,
    de: EstadoProposta,
    para: EstadoProposta,
  ): Promise<PaymentProposal | null> {
    const [row] = await db
      .update(whatsappProposals)
      .set({ estado: para })
      .where(
        and(
          eq(whatsappProposals.householdId, householdId),
          eq(whatsappProposals.id, id),
          eq(whatsappProposals.estado, de),
        ),
      )
      .returning()
    return row ? paraDominio(row) : null
  }

  return {
    async criar(nova) {
      // `estado` e `criadoEm` caem nos defaults do banco (proposta / now()). O
      // índice único parcial (`whatsapp_proposals_hash_ativo_uidx`) é quem decide
      // sob entrega concorrente do mesmo arquivo — não uma leitura seguida de
      // escrita; a violação vira `PropostaDuplicadaError` pra borda avisar.
      try {
        const [row] = await db
          .insert(whatsappProposals)
          .values({
            id: nova.id,
            householdId: nova.householdId,
            waMessageId: nova.waMessageId,
            bytesHash: nova.bytesHash,
            paidBy: nova.paidBy,
            billId: nova.billId,
            valorCentavos: nova.valorCentavos,
            dataPagamento: nova.dataPagamento,
            competencia: nova.competencia,
            favorecido: nova.favorecido,
            stagingKey: nova.stagingKey,
            tipoMime: nova.tipoMime,
          })
          .returning()
        return paraDominio(row)
      } catch (e) {
        if (ehViolacaoDeUnicidade(e, "whatsapp_proposals_hash_ativo_uidx")) {
          throw new PropostaDuplicadaError(nova.bytesHash)
        }
        throw e
      }
    },

    async obterAtivaPorHash(householdId, bytesHash) {
      const [row] = await db
        .select()
        .from(whatsappProposals)
        .where(
          and(
            eq(whatsappProposals.householdId, householdId),
            eq(whatsappProposals.bytesHash, bytesHash),
            inArray(whatsappProposals.estado, ESTADOS_PROPOSTA_ATIVA),
          ),
        )
        .orderBy(desc(whatsappProposals.criadoEm))
        .limit(1)
      return row ? paraDominio(row) : null
    },

    async obterPorId(householdId, id) {
      const [row] = await db
        .select()
        .from(whatsappProposals)
        .where(and(eq(whatsappProposals.householdId, householdId), eq(whatsappProposals.id, id)))
        .limit(1)
      return row ? paraDominio(row) : null
    },

    confirmar(householdId, id) {
      return transicao(householdId, id, "proposta", "confirmada")
    },
    cancelar(householdId, id) {
      return transicao(householdId, id, "proposta", "cancelada")
    },
    marcarExpirada(householdId, id) {
      return transicao(householdId, id, "proposta", "expirada")
    },

    async atualizarConta(householdId, id, billId, competencia) {
      const [row] = await db
        .update(whatsappProposals)
        .set({ billId, competencia })
        .where(
          and(
            eq(whatsappProposals.householdId, householdId),
            eq(whatsappProposals.id, id),
            eq(whatsappProposals.estado, "proposta"),
          ),
        )
        .returning()
      return row ? paraDominio(row) : null
    },

    async listarAbertas() {
      // Teto na varredura oportunista: um backlog patológico de abertas não vira um
      // scan sem-limite a cada evento — o excedente escoa nos passes seguintes (as
      // mais antigas primeiro, que são as que já expiraram). Sweep, não relatório.
      const rows = await db
        .select()
        .from(whatsappProposals)
        .where(eq(whatsappProposals.estado, "proposta"))
        .orderBy(whatsappProposals.criadoEm)
        .limit(MAX_VARREDURA)
      return rows.map(paraDominio)
    },
  }
}
