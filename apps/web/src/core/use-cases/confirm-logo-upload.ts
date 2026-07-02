import { validarLogo } from "../domain/attachment"
import { type Bill, chaveLogoBill } from "../domain/bill"
import type { AttachmentStore } from "../ports/attachment-store"
import type { BillRepo } from "../ports/bill-repo"
import { BillNaoEncontradaError } from "./edit-bill"
import { AttachmentInvalidoError } from "./prepare-attachment-upload"

/** O objeto confirmado não existe no R2 (o upload nunca chegou) — não há o que registrar. */
function uploadAusente(): AttachmentInvalidoError {
  return new AttachmentInvalidoError([
    { campo: "arquivo", mensagem: "Upload não encontrado. Tente enviar de novo." },
  ])
}

/**
 * Use-case: confirma o logo de uma Conta **depois** que o navegador o subiu
 * pro R2 (2ª etapa do upload por URL assinada — espelha `registerAttachment`).
 * Lê tamanho e tipo **reais** do objeto no R2 (não confia no cliente) e os
 * valida (só imagem, teto de 25 MB — CONTEXT.md #3). Persiste via `BillRepo`,
 * não uma tabela própria: o logo é só uma chave na Conta. A chave é por upload
 * (não fixa): confirma o objeto novo primeiro e só então limpa o antigo — o
 * logo em uso nunca é destruído por uma confirmação que falha no meio.
 */
export async function confirmLogoUpload(
  repo: BillRepo,
  store: AttachmentStore,
  householdId: string,
  billId: string,
  uploadId: string,
): Promise<Bill> {
  const bill = await repo.obterBill(householdId, billId)
  if (!bill) throw new BillNaoEncontradaError()
  // Copiado antes de mutar via `definirLogo` — não relê `bill.logoKey` depois.
  const chaveAntiga = bill.logoKey

  const chaveR2 = chaveLogoBill(householdId, billId, uploadId)
  const real = await store.metadados(chaveR2)
  if (!real) throw uploadAusente()

  const erros = validarLogo(real.tipoMime, real.tamanhoBytes)
  if (erros.length > 0) throw new AttachmentInvalidoError(erros)

  const atualizada = await repo.definirLogo(householdId, billId, chaveR2)
  if (!atualizada) throw new BillNaoEncontradaError()

  // Limpa o logo anterior só depois do novo confirmado — nunca antes.
  if (chaveAntiga && chaveAntiga !== chaveR2) await store.remover(chaveAntiga)

  return atualizada
}
