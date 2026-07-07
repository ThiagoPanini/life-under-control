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

/** Adapter Drizzle da Proposta de Lançamento (ADR-0003, ADR-0012, issue #158). */
export function drizzleWhatsappProposalRepo(db: Db = getDb()): PaymentProposalRepo {
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
  }
}
