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
  compacto = false,
  notaValor,
  billId,
  successHref,
  closeHref,
  onOperacaoEmAndamento,
}: {
  action: (prev: PaymentFormState, formData: FormData) => Promise<PaymentFormState>
  pessoas: PessoaComAvatar[]
  inicial: PaymentFormInicial
  competenciasComLancamento?: string[]
  submitLabel?: string
  submittingLabel?: string
  onCancelar?: () => void
  wizard?: boolean
  /** Modal compacto (Final): um passo só, competência fixa e comprovantes inline. */
  compacto?: boolean
  notaValor?: string
  billId?: string
  successHref?: string
  /** Modal compacto (Final): rota do "Cancelar" do rodapé — o mesmo destino do X do Modal. */
  closeHref?: string
  /**
   * Modal compacto (#100): avisa o pai quando a operação pós-registro está em
   * curso (Lançamento criado, uploads/decisão pendentes) — o modal usa isso para
   * travar o descarte silencioso (Escape/backdrop) enquanto não conclui (AC13).
   */
  onOperacaoEmAndamento?: (emAndamento: boolean) => void
}) {
  // Wizard e compacto compartilham o pós-registro: upload dos comprovantes em
  // duas etapas e o redirect com `lancado=` — só a coleta dos campos difere.
  const comComprovantes = wizard || compacto
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  const [arquivos, setArquivos] = useState<File[]>([])
  const [finalizando, setFinalizando] = useState(false)
  const [erroFinalizacao, setErroFinalizacao] = useState<string | null>(null)
  const iniciadoRef = useRef<string | null>(null)
  // Comprovantes de fato associados, somados através de eventuais retries — o
  // número que o toast final anuncia (não o de arquivos tentados, #100).
  const enviadosRef = useRef(0)
  const router = useRouter()

  // Fecha o modal com sucesso: leva competência, valor e a contagem de
  // comprovantes associados no destino, para o toast identificar os três (#100).
  const irParaSucesso = useCallback(
    (competencia: string, valor?: number) => {
      if (!successHref) return
      const separador = successHref.includes("?") ? "&" : "?"
      const params = new URLSearchParams({
        lancado: competencia,
        comprovantes: String(enviadosRef.current),
      })
      if (valor != null) params.set("valor", String(valor))
      router.replace(`${successHref}${separador}${params.toString()}`)
      router.refresh()
    },
    [router, successHref],
  )

  const finalizarRegistro = useCallback(
    async (paymentId: string, competencia: string, valor?: number) => {
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

      // Só os que passaram entram na contagem — acumula entre retries (#100).
      enviadosRef.current += arquivos.length - falhos.length

      if (falhos.length > 0) {
        setArquivos(falhos)
        setErroFinalizacao(
          `${falhos.length} ${falhos.length === 1 ? "comprovante não foi enviado" : "comprovantes não foram enviados"}. O Lançamento já está registrado.`,
        )
        setFinalizando(false)
        return
      }

      irParaSucesso(competencia, valor)
      setFinalizando(false)
    },
    [arquivos, billId, successHref, irParaSucesso],
  )

  // A operação está em curso já no submit em voo (`pending`) e segue até a tela
  // de progresso concluir (uploads correndo ou decisão sobre falhas) — o pai trava
  // o descarte silencioso em todo esse intervalo. Incluir `pending` fecha a janela
  // em que o Lançamento nasce no servidor mas ainda não voltou: fechar aí o
  // gravaria sem comprovantes nem toast (#100, AC13).
  const emProgresso = Boolean(
    comComprovantes && (pending || (state.createdPaymentId && state.competencia)),
  )

  useEffect(() => {
    onOperacaoEmAndamento?.(emProgresso)
  }, [emProgresso, onOperacaoEmAndamento])

  useEffect(() => {
    if (
      !comComprovantes ||
      !state.createdPaymentId ||
      !state.competencia ||
      iniciadoRef.current === state.createdPaymentId
    )
      return
    iniciadoRef.current = state.createdPaymentId
    void finalizarRegistro(state.createdPaymentId, state.competencia, state.valor)
  }, [comComprovantes, finalizarRegistro, state.competencia, state.createdPaymentId, state.valor])

  if (comComprovantes && state.createdPaymentId && state.competencia) {
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
                  state.valor,
                )
              }
            >
              Tentar novamente
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => irParaSucesso(state.competencia as string, state.valor)}
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
      competenciaOculta={compacto}
      notaValor={notaValor}
      arquivos={compacto ? arquivos : undefined}
      onArquivosChange={compacto ? setArquivos : undefined}
      onCancelar={
        onCancelar ??
        (compacto && closeHref ? () => router.replace(closeHref, { scroll: false }) : undefined)
      }
    />
  )
}
