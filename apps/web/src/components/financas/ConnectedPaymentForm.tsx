"use client"

import { useRouter } from "next/navigation"
import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import {
  confirmarComprovante,
  type PaymentFormState,
  prepararComprovante,
} from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { PaymentForm } from "@/components/financas/PaymentForm"
import { PaymentWizard } from "@/components/financas/PaymentWizard"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import type { PessoaComAvatar } from "@/core/use-cases/resolve-avatares"

/**
 * Liga o `PaymentForm` a um server action via `useActionState` (borda fina) — a
 * fiação única da baixa **e** da edição. O Server Component passa o action pronto
 * (`criarLancamento`/`editarLancamento` com os ids ligados no servidor), as
 * Pessoas, os valores iniciais e as competências já lançadas (o aviso). Os
 * rótulos e o `onCancelar` (edição no lugar) são opcionais.
 */
export function ConnectedPaymentForm({
  action,
  pessoas,
  inicial,
  competenciasComLancamento,
  submitLabel,
  submittingLabel,
  onCancelar,
  wizard = false,
  billId,
  successHref,
}: {
  action: (prev: PaymentFormState, formData: FormData) => Promise<PaymentFormState>
  pessoas: PessoaComAvatar[]
  inicial: PaymentFormInicial
  competenciasComLancamento?: string[]
  submitLabel?: string
  submittingLabel?: string
  onCancelar?: () => void
  wizard?: boolean
  billId?: string
  successHref?: string
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  const [arquivos, setArquivos] = useState<File[]>([])
  const [finalizando, setFinalizando] = useState(false)
  const [erroFinalizacao, setErroFinalizacao] = useState<string | null>(null)
  const iniciadoRef = useRef<string | null>(null)
  const router = useRouter()

  const finalizarRegistro = useCallback(
    async (paymentId: string, competencia: string) => {
      if (!billId || !successHref) return
      setFinalizando(true)
      setErroFinalizacao(null)
      const falhos: File[] = []
      for (const file of arquivos) {
        try {
          const prep = await prepararComprovante(paymentId, {
            nomeOriginal: file.name,
            tipoMime: file.type,
            tamanhoBytes: file.size,
          })
          if (!prep.ok) throw new Error(prep.erro)
          const upload = await fetch(prep.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          })
          if (!upload.ok) throw new Error("Falha no envio")
          const confirmacao = await confirmarComprovante(
            billId,
            paymentId,
            prep.attachmentId,
            file.name,
          )
          if (!confirmacao.ok) throw new Error(confirmacao.erro)
        } catch {
          falhos.push(file)
        }
      }

      if (falhos.length > 0) {
        setArquivos(falhos)
        setErroFinalizacao(
          `${falhos.length} ${falhos.length === 1 ? "comprovante não foi enviado" : "comprovantes não foram enviados"}. O Lançamento já está registrado.`,
        )
        setFinalizando(false)
        return
      }

      const separador = successHref.includes("?") ? "&" : "?"
      router.replace(`${successHref}${separador}lancado=${encodeURIComponent(competencia)}`)
      router.refresh()
      setFinalizando(false)
    },
    [arquivos, billId, router, successHref],
  )

  useEffect(() => {
    if (
      !wizard ||
      !state.createdPaymentId ||
      !state.competencia ||
      iniciadoRef.current === state.createdPaymentId
    )
      return
    iniciadoRef.current = state.createdPaymentId
    void finalizarRegistro(state.createdPaymentId, state.competencia)
  }, [finalizarRegistro, state.competencia, state.createdPaymentId, wizard])

  if (wizard && state.createdPaymentId && state.competencia) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-luc-lg border border-luc-border bg-luc-surface-2 p-6 text-center">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full text-lg ${erroFinalizacao ? "bg-luc-warn/10 text-luc-warn" : "bg-luc-success/10 text-luc-success"}`}
        >
          {erroFinalizacao ? "!" : "✓"}
        </span>
        <h2 className="mt-4 text-[15px] font-bold text-luc-text">Lançamento registrado</h2>
        <p className="mt-1 max-w-[48ch] text-[11.5px] leading-relaxed text-luc-muted">
          {erroFinalizacao ??
            (finalizando ? "Guardando os comprovantes…" : "Atualizando a história da Conta…")}
        </p>
        {erroFinalizacao && billId && successHref && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                void finalizarRegistro(
                  state.createdPaymentId as string,
                  state.competencia as string,
                )
              }
            >
              Tentar novamente
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const separador = successHref.includes("?") ? "&" : "?"
                router.replace(
                  `${successHref}${separador}lancado=${encodeURIComponent(state.competencia as string)}`,
                )
              }}
            >
              Continuar sem comprovante
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (wizard) {
    return (
      <PaymentWizard
        formAction={formAction}
        erros={state.erros}
        pending={pending}
        pessoas={pessoas}
        inicial={inicial}
        competenciasComLancamento={competenciasComLancamento}
        arquivos={arquivos}
        onArquivosChange={setArquivos}
      />
    )
  }

  return (
    <PaymentForm
      formAction={formAction}
      erros={state.erros}
      pending={pending}
      pessoas={pessoas}
      inicial={inicial}
      competenciasComLancamento={competenciasComLancamento}
      submitLabel={submitLabel}
      submittingLabel={submittingLabel}
      onCancelar={onCancelar}
    />
  )
}
