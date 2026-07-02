import { validarLogo } from "../domain/attachment"
import { chaveLogoBill } from "../domain/bill"
import type { AttachmentStore } from "../ports/attachment-store"
import { AttachmentInvalidoError } from "./prepare-attachment-upload"

export type LogoUploadPreparado = {
  chaveR2: string
  uploadUrl: string
}

/**
 * Use-case: 1ª etapa do upload do logo de uma Conta por URL assinada
 * (ADR-0008, espelha `prepareAttachmentUpload`). Valida (só imagem, teto de
 * 25 MB) e assina uma chave **por upload** (`uploadId` gerado pela borda,
 * como o Anexo) — o logo em uso segue intacto até a confirmação suceder.
 * Nada é persistido; a confirmação é quem grava `bills.logoKey`.
 */
export async function prepareLogoUpload(
  store: AttachmentStore,
  householdId: string,
  billId: string,
  uploadId: string,
  tipoMime: string,
  tamanhoBytes: number,
): Promise<LogoUploadPreparado> {
  const erros = validarLogo(tipoMime, tamanhoBytes)
  if (erros.length > 0) throw new AttachmentInvalidoError(erros)

  const chaveR2 = chaveLogoBill(householdId, billId, uploadId)
  const uploadUrl = await store.urlDeUpload(chaveR2, tipoMime)
  return { chaveR2, uploadUrl }
}
