import type { Attachment, DadosAttachment } from "../domain/attachment"

/**
 * Metadados de um Anexo novo já validados, mais identidade e ligações: o id (o
 * mesmo da chave R2, gerado na borda antes do upload), o Lar dono, o Lançamento a
 * que pertence, a chave no bucket e quem subiu.
 */
export type NovoAttachment = DadosAttachment & {
  id: string
  householdId: string
  paymentId: string
  chaveR2: string
  uploadedBy: string
}

/**
 * Port de persistência dos *metadados* de Anexo (ADR-0003) — os bytes vão pelo
 * `AttachmentStore`. O núcleo depende desta interface, não de Drizzle; um adapter
 * a implementa e os testes usam um fake. Toda operação é escopada pelo
 * `householdId` (o Lar logado) — um Anexo de outro Lar é invisível, e
 * abrir/remover fora do Lar não acha.
 */
export type AttachmentRepo = {
  /** Grava os metadados (após o upload confirmado) e devolve a forma de domínio. */
  criarAttachment(novo: NovoAttachment): Promise<Attachment>
  /** Lista os Anexos de um Lançamento do Lar, mais recentes primeiro (acesso simétrico, #1). */
  listarAttachments(householdId: string, paymentId: string): Promise<Attachment[]>
  /** Lista os Anexos de vários Lançamentos do Lar numa só consulta (evita N+1 no detalhe). */
  listarAttachmentsPorPayments(householdId: string, paymentIds: string[]): Promise<Attachment[]>
  /** Carrega um Anexo do Lar por id (para assinar a leitura); `null` se não achou. */
  obterAttachment(householdId: string, attachmentId: string): Promise<Attachment | null>
  /**
   * Troca só o `nomeOriginal` do Anexo (saneamento da correção de Competência,
   * #124 — o nome acompanha a competência corrigida); `null` se não achou. Não é
   * edição de conteúdo: bytes, chave e autoria ficam intactos (imutável, #4).
   */
  renomearAttachment(
    householdId: string,
    attachmentId: string,
    nomeOriginal: string,
  ): Promise<Attachment | null>
  /** Apaga os metadados do Lar e devolve o Anexo removido (para apagar o objeto); `null` se não achou. */
  deletarAttachment(householdId: string, attachmentId: string): Promise<Attachment | null>
}
