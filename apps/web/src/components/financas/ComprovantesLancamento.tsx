"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import {
  abrirComprovante,
  confirmarComprovante,
  prepararComprovante,
  removerComprovante,
} from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import type { Attachment } from "@/core/domain/attachment"

/** O picker aceita imagem ou PDF (o use-case revalida o tipo do lado servidor). */
const ACEITA = "image/*,application/pdf"

/** Tamanho legível a partir de bytes (B · KB · MB). */
function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/**
 * Comprovantes de um Lançamento (borda fina — ADR-0008). Lista os anexos (abrir /
 * remover) e anexa novos pelo upload em três tempos por URL assinada: pede a URL
 * (`prepararComprovante`), sobe o arquivo **direto pro R2** (PUT, sem passar pelo
 * app) e confirma os metadados (`confirmarComprovante`). Substituir é remover e
 * anexar de novo. Após gravar, `router.refresh()` traz a lista revalidada.
 */
export function ComprovantesLancamento({
  billId,
  paymentId,
  comprovantes,
}: {
  billId: string
  paymentId: string
  comprovantes: Attachment[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function anexar(file: File) {
    setErro(null)
    setEnviando(true)
    try {
      const bruto = { nomeOriginal: file.name, tipoMime: file.type, tamanhoBytes: file.size }
      const prep = await prepararComprovante(paymentId, bruto)
      if (!prep.ok) {
        setErro(prep.erro)
        return
      }
      // O navegador sobe os bytes direto pro R2 — o Content-Type casa o que foi assinado.
      const resposta = await fetch(prep.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })
      if (!resposta.ok) {
        setErro("Falha ao subir o arquivo. Tente de novo.")
        return
      }
      // O servidor lê tamanho/tipo reais do R2; aqui basta o nome (rótulo).
      const conf = await confirmarComprovante(billId, paymentId, prep.attachmentId, file.name)
      if (!conf.ok) {
        setErro(conf.erro)
        return
      }
      router.refresh()
    } catch {
      setErro("Algo deu errado ao anexar.")
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function abrir(attachmentId: string) {
    setErro(null)
    // Abre a aba já no clique (gesto do usuário); preenchê-la só depois do await
    // dispararia o bloqueio de pop-up (Safari/iOS). `opener = null` isola a aba.
    const aba = window.open("", "_blank")
    if (aba) aba.opener = null
    const url = await abrirComprovante(attachmentId)
    if (url) {
      if (aba) aba.location.replace(url)
      else window.open(url, "_blank", "noopener,noreferrer")
      return
    }
    aba?.close()
    setErro("Comprovante indisponível. Atualize a página.")
    router.refresh()
  }

  async function remover(attachmentId: string) {
    setErro(null)
    setRemovendo(attachmentId)
    try {
      const res = await removerComprovante(billId, attachmentId)
      if (!res.ok) {
        setErro(res.erro)
        return
      }
      router.refresh()
    } catch {
      setErro("Não foi possível remover. Tente de novo.")
    } finally {
      setRemovendo(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-luc-border/60 border-t pt-3">
      {comprovantes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {comprovantes.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-luc-md border border-luc-border bg-luc-surface-2 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => abrir(c.id)}
                className="min-w-0 truncate text-left text-luc-text text-sm underline-offset-2 hover:text-luc-accent hover:underline"
              >
                {c.nomeOriginal}
              </button>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-[11px] text-luc-text-3">
                  {formatarTamanho(c.tamanhoBytes)}
                </span>
                <button
                  type="button"
                  onClick={() => remover(c.id)}
                  disabled={removendo === c.id}
                  className="text-luc-text-3 text-xs hover:text-luc-warn disabled:opacity-50"
                >
                  {removendo === c.id ? "Removendo…" : "Remover"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="self-start"
        >
          {enviando
            ? "Anexando…"
            : comprovantes.length > 0
              ? "+ Anexar outro"
              : "+ Anexar comprovante"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACEITA}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) anexar(file)
          }}
        />
      </div>

      {erro && (
        <p role="alert" className="text-luc-warn text-sm">
          {erro}
        </p>
      )}
    </div>
  )
}
