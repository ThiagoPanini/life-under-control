"use client"

import { useRouter } from "next/navigation"
import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import {
  type ContaFormState,
  confirmarLogoConta,
  prepararLogoConta,
} from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { BillForm } from "@/components/financas/BillForm"
import type { BillFormInicial } from "@/components/financas/bill-form-inicial"

/**
 * Liga o `BillForm` a um server action via `useActionState` — a fiação única de
 * cadastro e edição (borda fina). O Server Component passa o action pronto:
 * `criarConta` no cadastro, `editarConta.bind(null, billId)` na edição (o id
 * ligado no servidor, nunca vindo do formulário), mais os valores iniciais e os
 * rótulos do botão.
 */
export function ConnectedBillForm({
  action,
  inicial,
  submitLabel,
  submittingLabel,
  createMode = false,
  successHref = "/areas/financas/pagamentos-recorrentes",
}: {
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  inicial?: BillFormInicial
  submitLabel?: string
  submittingLabel?: string
  createMode?: boolean
  successHref?: string
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [finalizando, setFinalizando] = useState(false)
  const [erroFinalizacao, setErroFinalizacao] = useState<string | null>(null)
  const iniciadoRef = useRef<string | null>(null)
  const router = useRouter()

  const finalizarCriacao = useCallback(
    async (billId: string) => {
      setFinalizando(true)
      setErroFinalizacao(null)
      try {
        if (logoFile) {
          const prep = await prepararLogoConta(billId, logoFile.type, logoFile.size)
          if (!prep.ok) throw new Error(prep.erro)
          const upload = await fetch(prep.uploadUrl, {
            method: "PUT",
            body: logoFile,
            headers: { "Content-Type": logoFile.type },
          })
          if (!upload.ok) throw new Error("Não foi possível enviar o logo.")
          const confirmacao = await confirmarLogoConta(billId, prep.uploadId)
          if (!confirmacao.ok) throw new Error(confirmacao.erro)
        }
        router.replace(successHref)
        router.refresh()
      } catch (error) {
        setErroFinalizacao(
          error instanceof Error
            ? error.message
            : "A Conta foi criada, mas o logo não foi enviado.",
        )
      } finally {
        setFinalizando(false)
      }
    },
    [logoFile, router, successHref],
  )

  useEffect(() => {
    if (!createMode || !state.createdBillId || iniciadoRef.current === state.createdBillId) return
    iniciadoRef.current = state.createdBillId
    void finalizarCriacao(state.createdBillId)
  }, [createMode, finalizarCriacao, state.createdBillId])

  if (createMode && state.createdBillId) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-luc-lg border border-luc-border bg-luc-surface-2 p-6 text-center">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-full ${erroFinalizacao ? "bg-luc-warn/10 text-luc-warn" : "bg-luc-success/10 text-luc-success"}`}
        >
          {erroFinalizacao ? "!" : "✓"}
        </span>
        <h2 className="mt-4 text-[15px] font-bold text-luc-text">
          {erroFinalizacao ? "Conta criada; falta concluir o logo" : "Conta criada"}
        </h2>
        <p className="mt-1 max-w-[46ch] text-[11.5px] leading-relaxed text-luc-muted">
          {erroFinalizacao ??
            (finalizando ? "Finalizando os últimos detalhes…" : "Abrindo suas Contas…")}
        </p>
        {erroFinalizacao && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => void finalizarCriacao(state.createdBillId as string)}
            >
              Tentar o logo novamente
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.replace(successHref)}>
              Continuar sem logo
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <BillForm
      formAction={formAction}
      erros={state.erros}
      pending={pending}
      inicial={inicial}
      submitLabel={submitLabel}
      submittingLabel={submittingLabel}
      logoFile={createMode ? logoFile : undefined}
      onLogoFileChange={createMode ? setLogoFile : undefined}
      mode={createMode ? "create" : "edit"}
    />
  )
}
