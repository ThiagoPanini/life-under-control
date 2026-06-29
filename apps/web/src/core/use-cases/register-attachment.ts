import { type Attachment, chaveComprovante, validarDadosAttachment } from "../domain/attachment"
import type { AttachmentRepo } from "../ports/attachment-repo"
import type { AttachmentStore } from "../ports/attachment-store"
import { AttachmentInvalidoError } from "./prepare-attachment-upload"

/** O objeto confirmado não existe no R2 (o upload nunca chegou) — não há o que registrar. */
function uploadAusente(): AttachmentInvalidoError {
  return new AttachmentInvalidoError([
    { campo: "arquivo", mensagem: "Upload não encontrado. Tente anexar de novo." },
  ])
}

/**
 * Use-case: registra os metadados de um comprovante **depois** que o navegador o
 * subiu pro R2 (a segunda etapa do upload por URL assinada). Lê tamanho e tipo
 * **reais** do objeto no R2 (`store.metadados`) — não confia no que o cliente
 * declara — e valida esses fatos (o teto de 25 MB e o tipo são enforçados sobre
 * os bytes que de fato subiram, não sobre a promessa do cliente, CONTEXT.md #3).
 * Re-deriva a chave a partir dos ids. `householdId`/`uploadedBy` vêm da borda. O
 * `nomeOriginal` é cosmético (rótulo de exibição) e fica como o cliente o enviou.
 */
export async function registerAttachment(
  repo: AttachmentRepo,
  store: AttachmentStore,
  householdId: string,
  paymentId: string,
  attachmentId: string,
  uploadedBy: string,
  nomeOriginal: string,
): Promise<Attachment> {
  const chaveR2 = chaveComprovante(householdId, paymentId, attachmentId)
  const real = await store.metadados(chaveR2)
  if (!real) throw uploadAusente()

  const res = validarDadosAttachment({
    nomeOriginal,
    tipoMime: real.tipoMime,
    tamanhoBytes: real.tamanhoBytes,
  })
  if (!res.ok) throw new AttachmentInvalidoError(res.erros)

  return repo.criarAttachment({
    id: attachmentId,
    householdId,
    paymentId,
    chaveR2,
    uploadedBy,
    ...res.value,
  })
}
