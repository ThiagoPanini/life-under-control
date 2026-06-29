import {
  type AttachmentBruto,
  chaveComprovante,
  validarDadosAttachment,
} from "../domain/attachment"
import type { ErroCampo } from "../domain/bill"
import type { AttachmentStore } from "../ports/attachment-store"

/** O anexo não passou na validação de domínio — carrega os erros por campo. */
export class AttachmentInvalidoError extends Error {
  constructor(readonly erros: ErroCampo[]) {
    super("Anexo inválido")
    this.name = "AttachmentInvalidoError"
  }
}

/** O que a borda precisa para o upload direto: a URL assinada e o id/chave a confirmar depois. */
export type UploadPreparado = {
  attachmentId: string
  chaveR2: string
  uploadUrl: string
}

/**
 * Use-case: prepara o upload de um comprovante por **URL assinada** (ADR-0008). O
 * `attachmentId` vem da borda (gerado antes do upload, é o mesmo da chave), os
 * metadados crus são validados no núcleo (tipo imagem/PDF, tamanho), a chave é
 * derivada no domínio e o port assina o PUT — **nada é persistido aqui**: os
 * metadados só entram no banco quando o navegador confirma o upload
 * (`registerAttachment`), evitando linha órfã se o upload falhar.
 */
export async function prepareAttachmentUpload(
  store: AttachmentStore,
  householdId: string,
  paymentId: string,
  attachmentId: string,
  bruto: AttachmentBruto,
): Promise<UploadPreparado> {
  const res = validarDadosAttachment(bruto)
  if (!res.ok) throw new AttachmentInvalidoError(res.erros)
  const chaveR2 = chaveComprovante(householdId, paymentId, attachmentId)
  const uploadUrl = await store.urlDeUpload(chaveR2, res.value.tipoMime)
  return { attachmentId, chaveR2, uploadUrl }
}
