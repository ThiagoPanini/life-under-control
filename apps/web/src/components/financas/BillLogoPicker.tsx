"use client"

import { Paperclip, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import {
  confirmarLogoConta,
  prepararLogoConta,
  removerLogoConta,
} from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { BillLogoTile } from "@/components/financas/BillLogoTile"

/** O picker aceita só imagem — o use-case revalida o tipo do lado servidor. */
const ACEITA = "image/*"

/**
 * Logo de uma Conta (borda fina — ADR-0008, #50). Sobe/troca/remove pelo mesmo
 * caminho dos Comprovantes: upload em três tempos por URL assinada (prepara →
 * PUT direto pro R2 → confirma). Chave fixa por Conta: trocar sobrescreve o
 * mesmo objeto. Após gravar, `router.refresh()` traz o logo revalidado.
 *
 * Duas vestes: a padrão (página de edição — tile 48px + botões) e a `compacto`
 * do modal de edição rápida (Final): chip "Logo personalizado" com X quando há
 * logo, e o CTA tracejado com clipe ("Enviar/Trocar o logo · imagem").
 */
export function BillLogoPicker({
  billId,
  icon,
  logoUrl,
  variant = "padrao",
}: {
  billId: string
  icon: string
  logoUrl: string | null
  variant?: "padrao" | "compacto"
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(file: File) {
    setErro(null)
    setEnviando(true)
    try {
      const prep = await prepararLogoConta(billId, file.type, file.size)
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
      const conf = await confirmarLogoConta(billId, prep.uploadId)
      if (!conf.ok) {
        setErro(conf.erro)
        return
      }
      router.refresh()
    } catch {
      setErro("Algo deu errado ao enviar o logo.")
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function remover() {
    setErro(null)
    setRemovendo(true)
    try {
      const res = await removerLogoConta(billId)
      if (!res.ok) {
        setErro(res.erro)
        return
      }
      router.refresh()
    } catch {
      setErro("Não foi possível remover. Tente de novo.")
    } finally {
      setRemovendo(false)
    }
  }

  if (variant === "compacto") {
    return (
      <div className="flex flex-col gap-2">
        {logoUrl && (
          <div className="flex items-center gap-2.5 rounded-[9px] border border-luc-accent/[0.32] bg-luc-accent-06 px-[11px] py-[9px]">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white/[0.05]">
              {/* biome-ignore lint/performance/noImgElement: URL assinada volátil; sem domínio fixo pro next/image */}
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-luc-text">
              Logo personalizado
            </span>
            <button
              type="button"
              aria-label="Remover logo"
              onClick={remover}
              disabled={enviando || removendo}
              className="flex shrink-0 rounded-[7px] p-1 text-luc-text-3 transition-colors hover:text-luc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent disabled:cursor-not-allowed"
            >
              <X aria-hidden size={15} />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando || removendo}
          className="flex w-full items-center gap-[9px] rounded-[9px] border border-luc-border-strong border-dashed bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-luc-accent/45 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent disabled:cursor-not-allowed"
        >
          <Paperclip aria-hidden size={15} className="shrink-0 text-luc-text-3" />
          <span className="min-w-0 flex-1 text-[12.5px] text-luc-text-2">
            {enviando
              ? "Enviando…"
              : removendo
                ? "Removendo…"
                : logoUrl
                  ? "Trocar o logo"
                  : "Enviar um logo"}{" "}
            <span className="text-luc-faint">· imagem</span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACEITA}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) enviar(file)
          }}
        />
        {erro && (
          <p role="alert" className="text-[11px] text-luc-warn">
            {erro}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border-luc-border border-t pt-5">
      <span className="text-[11.5px] font-semibold text-luc-text-3">Logo (opcional)</span>
      <div className="flex flex-wrap items-center gap-3">
        <BillLogoTile icon={icon} logoUrl={logoUrl} size={48} iconSize={22} />
        <Button
          variant="secondary"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando || removendo}
        >
          {enviando ? "Enviando…" : logoUrl ? "Trocar logo" : "Enviar logo"}
        </Button>
        {logoUrl && (
          <Button variant="ghost" type="button" onClick={remover} disabled={enviando || removendo}>
            {removendo ? "Removendo…" : "Remover"}
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACEITA}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) enviar(file)
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
