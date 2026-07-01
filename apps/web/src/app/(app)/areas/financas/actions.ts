"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleAttachmentRepo } from "@/adapters/db/attachment-repo.drizzle"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { auth } from "@/auth"
import type { AttachmentBruto } from "@/core/domain/attachment"
import type { BillBruto, ErroCampo } from "@/core/domain/bill"
import type { Pessoa } from "@/core/domain/household"
import { parseCentavos } from "@/core/domain/money"
import type { PaymentBruto } from "@/core/domain/payment"
import { BillInvalidaError, createBill } from "@/core/use-cases/create-bill"
import { deleteBill } from "@/core/use-cases/delete-bill"
import { deletePayment } from "@/core/use-cases/delete-payment"
import { BillNaoEncontradaError, editBill } from "@/core/use-cases/edit-bill"
import { editPayment, PaymentNaoEncontradoError } from "@/core/use-cases/edit-payment"
import { EncerramentoInvalidoError, encerrarBill } from "@/core/use-cases/encerrar-bill"
import { getPainel } from "@/core/use-cases/get-painel"
import { openAttachment } from "@/core/use-cases/open-attachment"
import {
  AttachmentInvalidoError,
  prepareAttachmentUpload,
} from "@/core/use-cases/prepare-attachment-upload"
import { PaymentInvalidoError, recordPayment } from "@/core/use-cases/record-payment"
import { registerAttachment } from "@/core/use-cases/register-attachment"
import { removeAttachment } from "@/core/use-cases/remove-attachment"

/** Estado do formulário de Conta entre submissões — só os erros por campo (vazio = ok). */
export type ContaFormState = { erros: ErroCampo[] }

/** Estado do encerramento entre submissões — uma mensagem de erro (vazio = ok). */
export type EncerrarContaState = { erro?: string }

/** A lista do Assunto Pagamentos Recorrentes — destino e chave de revalidação de toda ação de Conta (ADR-0009). */
const ROTA_FINANCAS = "/areas/financas/pagamentos-recorrentes"

/** Cauda comum de toda mutação bem-sucedida: revalida a lista e volta pra ela. */
function voltarParaFinancas(): never {
  revalidatePath(ROTA_FINANCAS)
  redirect(ROTA_FINANCAS)
}

/** Lê um campo numérico do form: vazio/ausente → null; texto inválido → null. */
function numeroOuNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/** Traduz o FormData do wizard num `BillBruto` cru — fonte única para criar e editar. */
function lerBrutoDoForm(formData: FormData): BillBruto {
  const descricao = formData.get("descricao")
  return {
    nome: String(formData.get("nome") ?? ""),
    descricao: descricao ? String(descricao) : null,
    icon: String(formData.get("icon") ?? ""),
    intervalMonths: numeroOuNull(formData.get("intervalMonths")) ?? Number.NaN,
    anchorMonth: numeroOuNull(formData.get("anchorMonth")),
    dueRuleKind: String(formData.get("dueRuleKind") ?? ""),
    dueRuleDay: numeroOuNull(formData.get("dueRuleDay")),
    dueRuleNth: numeroOuNull(formData.get("dueRuleNth")),
    dueMonthOffset: numeroOuNull(formData.get("dueMonthOffset")),
  }
}

/**
 * Server action de cadastro de Conta (borda fina — ADR-0003). Traduz o FormData
 * em `BillBruto`, resolve o Lar logado (o `householdId` nunca vem do formulário)
 * e chama o use-case `createBill`. Em erro de validação, devolve os erros por
 * campo para o wizard; no sucesso, revalida e volta à lista.
 */
export async function criarConta(
  _prev: ContaFormState,
  formData: FormData,
): Promise<ContaFormState> {
  const bruto = lerBrutoDoForm(formData)

  // Resolve o Lar pelo use-case (não o store direto): a borda fala com use-case
  // (ADR-0003), e LarNaoEncontradoError é a mesma falha que a página já trata.
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await createBill(drizzleBillRepo(), lar.id, bruto)
  } catch (e) {
    if (e instanceof BillInvalidaError) return { erros: e.erros }
    throw e
  }

  voltarParaFinancas()
}

/**
 * Server action de edição da regra de uma Conta. `billId` chega ligado (`.bind`)
 * pela borda — nunca do formulário. Reajustar a regra recalcula derivações
 * futuras, jamais reescreve os fatos passados (invariante #4).
 */
export async function editarConta(
  billId: string,
  _prev: ContaFormState,
  formData: FormData,
): Promise<ContaFormState> {
  const bruto = lerBrutoDoForm(formData)
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await editBill(drizzleBillRepo(), lar.id, billId, bruto)
  } catch (e) {
    if (e instanceof BillInvalidaError) return { erros: e.erros }
    if (e instanceof BillNaoEncontradaError) redirect(ROTA_FINANCAS)
    throw e
  }

  voltarParaFinancas()
}

/**
 * Server action de encerramento. Grava `encerrada` + a data civil informada (a
 * Pessoa pode datar "quando cancelei"); a Conta sai da lista ativa e cessa a
 * projeção. Data inválida volta como mensagem; sucesso revalida e volta à lista.
 */
export async function encerrarConta(
  billId: string,
  _prev: EncerrarContaState,
  formData: FormData,
): Promise<EncerrarContaState> {
  const encerradaEm = String(formData.get("encerradaEm") ?? "")
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await encerrarBill(drizzleBillRepo(), lar.id, billId, encerradaEm)
  } catch (e) {
    if (e instanceof EncerramentoInvalidoError)
      return { erro: "Informe uma data de encerramento válida." }
    if (e instanceof BillNaoEncontradaError) redirect(ROTA_FINANCAS)
    throw e
  }

  voltarParaFinancas()
}

/**
 * Server action de exclusão — destrutivo. Apaga a Conta e seus dependentes
 * (Lançamentos/Anexos). A contagem do aviso é mostrada antes, na borda; aqui só
 * se executa após a confirmação. Conta já ausente apenas volta à lista.
 */
export async function deletarConta(billId: string): Promise<void> {
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await deleteBill(drizzleBillRepo(), lar.id, billId)
  } catch (e) {
    if (e instanceof BillNaoEncontradaError) redirect(ROTA_FINANCAS)
    throw e
  }

  voltarParaFinancas()
}

// ── Lançamentos (baixa de uma Conta) ──────────────────────────────────────────

/** Estado do formulário de baixa entre submissões — só os erros por campo (vazio = ok). */
export type PaymentFormState = { erros: ErroCampo[] }

/** A rota do detalhe da Conta — destino e chave de revalidação das ações de baixa. */
function rotaDaConta(billId: string): string {
  return `${ROTA_FINANCAS}/${billId}`
}

/** Cauda comum das mutações de Lançamento: revalida o detalhe da Conta e volta a ele. */
function voltarParaConta(billId: string): never {
  revalidatePath(rotaDaConta(billId))
  redirect(rotaDaConta(billId))
}

/** Traduz o FormData da baixa num `PaymentBruto` cru — valor já em centavos (parse BR). */
function lerBrutoLancamento(formData: FormData): PaymentBruto {
  const data = formData.get("dataPagamento")
  return {
    valor: parseCentavos(String(formData.get("valor") ?? "")) ?? Number.NaN,
    dataPagamento: data ? String(data) : null,
    competencia: String(formData.get("competencia") ?? ""),
    paidBy: String(formData.get("paidBy") ?? ""),
  }
}

/**
 * Server action de baixa: registra um Lançamento na Conta (borda fina — ADR-0003).
 * O `billId` chega ligado (`.bind`) pela borda — nunca do formulário —, o Lar vem
 * do use-case e a data ausente assume hoje via o `Clock`. Erro de validação volta
 * por campo para o formulário; sucesso revalida e volta ao detalhe da Conta.
 */
export async function criarLancamento(
  billId: string,
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const bruto = lerBrutoLancamento(formData)
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await recordPayment(drizzlePaymentRepo(), systemClock(), lar.id, billId, bruto)
  } catch (e) {
    if (e instanceof PaymentInvalidoError) return { erros: e.erros }
    throw e
  }

  voltarParaConta(billId)
}

/**
 * Server action de edição de Lançamento. `billId` e `paymentId` chegam ligados.
 * Corrigir o que se registrou é direito da Pessoa (a imutabilidade #4 é do
 * sistema, não do autor); valida no núcleo e persiste pelo port.
 */
export async function editarLancamento(
  billId: string,
  paymentId: string,
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const bruto = lerBrutoLancamento(formData)
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await editPayment(drizzlePaymentRepo(), lar.id, paymentId, bruto)
  } catch (e) {
    if (e instanceof PaymentInvalidoError) return { erros: e.erros }
    if (e instanceof PaymentNaoEncontradoError) redirect(rotaDaConta(billId))
    throw e
  }

  voltarParaConta(billId)
}

/**
 * Server action de exclusão de Lançamento — desfaz um registro equivocado. As
 * duas Pessoas deletam (acesso simétrico, #1). Já ausente apenas volta ao detalhe.
 */
export async function deletarLancamento(billId: string, paymentId: string): Promise<void> {
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await deletePayment(drizzlePaymentRepo(), lar.id, paymentId)
  } catch (e) {
    if (e instanceof PaymentNaoEncontradoError) redirect(rotaDaConta(billId))
    throw e
  }

  voltarParaConta(billId)
}

// ── Comprovantes (Anexos de um Lançamento — ADR-0008) ─────────────────────────

/** Resultado de preparar o upload — a URL assinada e o id a confirmar, ou um erro. */
export type PrepararComprovanteResult =
  | { ok: true; attachmentId: string; uploadUrl: string }
  | { ok: false; erro: string }

/** Resultado de confirmar/remover um comprovante — sucesso ou uma mensagem de erro. */
export type ComprovanteResult = { ok: true } | { ok: false; erro: string }

/** A Pessoa logada (autoria do upload), casada por e-mail; sem casar, a 1ª do Lar. */
async function idDaPessoaLogada(pessoas: Pessoa[]): Promise<string> {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  const pessoa = (email && pessoas.find((p) => p.email.toLowerCase() === email)) || pessoas[0]
  return pessoa?.id ?? ""
}

/** Primeira mensagem de um erro de validação de anexo (para a borda exibir). */
function mensagemDeAnexoInvalido(e: AttachmentInvalidoError): string {
  return e.erros[0]?.mensagem ?? "Arquivo inválido."
}

/**
 * Server action (1ª etapa do upload por URL assinada — ADR-0008): valida os
 * metadados do arquivo e devolve a URL assinada de PUT para o navegador subir os
 * bytes direto pro R2, mais o `attachmentId` que a confirmação usará. O Lar vem
 * do use-case; o id é gerado aqui (é o mesmo da chave). **Nada é persistido** —
 * os metadados só entram no banco quando o upload é confirmado.
 */
export async function prepararComprovante(
  paymentId: string,
  bruto: AttachmentBruto,
): Promise<PrepararComprovanteResult> {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const attachmentId = randomUUID()

  try {
    const prep = await prepareAttachmentUpload(
      r2AttachmentStore(),
      lar.id,
      paymentId,
      attachmentId,
      bruto,
    )
    return { ok: true, attachmentId: prep.attachmentId, uploadUrl: prep.uploadUrl }
  } catch (e) {
    if (e instanceof AttachmentInvalidoError) return { ok: false, erro: mensagemDeAnexoInvalido(e) }
    throw e
  }
}

/**
 * Server action (2ª etapa): depois que o navegador subiu os bytes pro R2,
 * persiste os metadados do comprovante e revalida o detalhe da Conta. O tamanho e
 * o tipo são lidos do **objeto real no R2** dentro do use-case (não se confia no
 * cliente); aqui só passa o `nomeOriginal` (rótulo). `billId`/`paymentId`/
 * `attachmentId` chegam ligados pela borda; quem subiu é a Pessoa logada (#1).
 */
export async function confirmarComprovante(
  billId: string,
  paymentId: string,
  attachmentId: string,
  nomeOriginal: string,
): Promise<ComprovanteResult> {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const uploadedBy = await idDaPessoaLogada(lar.pessoas)

  try {
    await registerAttachment(
      drizzleAttachmentRepo(),
      r2AttachmentStore(),
      lar.id,
      paymentId,
      attachmentId,
      uploadedBy,
      nomeOriginal,
    )
  } catch (e) {
    if (e instanceof AttachmentInvalidoError) return { ok: false, erro: mensagemDeAnexoInvalido(e) }
    throw e
  }

  revalidatePath(rotaDaConta(billId))
  return { ok: true }
}

/**
 * Server action: resgata um comprovante — devolve uma URL assinada de leitura
 * (escopada pelo Lar) para a borda abri-lo numa aba. `null` se não achou (anexo
 * de outro Lar ou inexistente). Os bytes nunca passam pelo app.
 */
export async function abrirComprovante(attachmentId: string): Promise<string | null> {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  return openAttachment(r2AttachmentStore(), drizzleAttachmentRepo(), lar.id, attachmentId)
}

/**
 * Server action: remove um comprovante — apaga metadado e objeto no R2 (escopado
 * pelo Lar) e revalida o detalhe da Conta. Substituir é remover e anexar de novo.
 * As duas Pessoas removem (acesso simétrico, #1).
 */
export async function removerComprovante(
  billId: string,
  attachmentId: string,
): Promise<ComprovanteResult> {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  await removeAttachment(r2AttachmentStore(), drizzleAttachmentRepo(), lar.id, attachmentId)
  revalidatePath(rotaDaConta(billId))
  return { ok: true }
}
