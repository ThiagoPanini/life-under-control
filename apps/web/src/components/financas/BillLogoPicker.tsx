"use client"

import { Paperclip, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  confirmarLogoConta,
  prepararLogoConta,
  removerLogoConta,
} from "@/app/(app)/areas/financas/actions"
import { Button } from "@/components/ds/Button"
import { BillLogoTile } from "@/components/financas/BillLogoTile"

/** O picker aceita só imagem — o use-case revalida o tipo do lado servidor. */
const ACEITA = "image/*"

type BillLogoPickerPersistidoProps = {
  mode?: "persisted"
  billId: string
  icon: string
  logoUrl: string | null
  variant?: "padrao" | "compacto"
  /** Avisa o dono (modal) que um envio/remoção começou/terminou — trava o descarte silencioso. */
  onOperacaoEmAndamento?: (emAndamento: boolean) => void
}

type BillLogoPickerDiferidoProps = {
  mode: "deferred"
  icon: string
  file: File | null
  onFileChange: (file: File | null) => void
}

export type BillLogoPickerProps = BillLogoPickerPersistidoProps | BillLogoPickerDiferidoProps

/**
 * Logo de uma Conta (borda fina — ADR-0008, #50). Sobe/troca/remove pelo mesmo
 * caminho dos Comprovantes: upload em três tempos por URL assinada (prepara →
 * PUT direto pro R2 → confirma). Chave fixa por Conta: trocar sobrescreve o
 * mesmo objeto. Após gravar, `router.refresh()` traz o logo revalidado.
 *
 * Duas vestes: a padrão (tile 48px + botões) e a `compacto` do modal de edição
 * (Final): chip "Logo personalizado" com X quando há
 * logo, e o CTA tracejado com clipe ("Enviar/Trocar o logo · imagem").
 */
export function BillLogoPicker(props: BillLogoPickerProps) {
  if (props.mode === "deferred") return <BillLogoPickerDiferido {...props} />
  return <BillLogoPickerPersistido {...props} />
}

/** Seleção local usada no cadastro: preview por object URL, sem tocar servidor ou storage. */
function BillLogoPickerDiferido({ icon, file, onFileChange }: BillLogoPickerDiferidoProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return (
    <div className="flex flex-col gap-2">
      {file && (
        <div className="flex items-center gap-2.5 rounded-[9px] border border-luc-accent/[0.32] bg-luc-accent-06 px-[11px] py-[9px]">
          <BillLogoTile icon={icon} logoUrl={previewUrl} size={34} iconSize={18} />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-luc-text">
            {file.name}
          </span>
          <button
            type="button"
            aria-label="Remover logo selecionado"
            onClick={() => onFileChange(null)}
            className="flex shrink-0 rounded-[7px] p-1 text-luc-text-3 transition-colors hover:text-luc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
          >
            <X aria-hidden size={15} />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center gap-[9px] rounded-[9px] border border-luc-border-strong border-dashed bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-luc-accent/45 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
      >
        <Paperclip aria-hidden size={15} className="shrink-0 text-luc-text-3" />
        <span className="min-w-0 flex-1 text-[12.5px] text-luc-text-2">
          {file ? "Trocar o logo" : "Enviar um logo"}{" "}
          <span className="text-luc-faint">· imagem</span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACEITA}
        className="hidden"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      <span className="text-[10.5px] text-luc-faint">
        O arquivo só será enviado depois que a Conta existir.
      </span>
    </div>
  )
}

function BillLogoPickerPersistido({
  billId,
  icon,
  logoUrl,
  variant = "padrao",
  onOperacaoEmAndamento,
}: BillLogoPickerPersistidoProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(file: File) {
    setErro(null)
    setEnviando(true)
    onOperacaoEmAndamento?.(true)
    try {
      const prep = await prepararLogoConta(billId, file.type, file.size)
      if (!prep.ok) {
        console.error("[logo] preparar upload falhou (edição):", { billId, erro: prep.erro })
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
        console.error("[logo] PUT do upload falhou (edição):", { billId, status: resposta.status })
        setErro("Falha ao subir o arquivo. Tente de novo.")
        return
      }
      const conf = await confirmarLogoConta(billId, prep.uploadId)
      if (!conf.ok) {
        console.error("[logo] confirmar upload falhou (edição):", { billId, erro: conf.erro })
        setErro(conf.erro)
        return
      }
      router.refresh()
    } catch (e) {
      console.error("[logo] exceção no upload (edição):", e)
      setErro("Algo deu errado ao enviar o logo.")
    } finally {
      setEnviando(false)
      onOperacaoEmAndamento?.(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function remover() {
    setErro(null)
    setRemovendo(true)
    onOperacaoEmAndamento?.(true)
    try {
      const res = await removerLogoConta(billId)
      if (!res.ok) {
        console.error("[logo] remover falhou (edição):", { billId, erro: res.erro })
        setErro(res.erro)
        return
      }
      router.refresh()
    } catch (e) {
      console.error("[logo] exceção ao remover (edição):", e)
      setErro("Não foi possível remover. Tente de novo.")
    } finally {
      setRemovendo(false)
      onOperacaoEmAndamento?.(false)
    }
  }

  if (variant === "compacto") {
    return (
      <div className="flex flex-col gap-2">
        {logoUrl && (
          <div className="flex items-center gap-2.5 rounded-[9px] border border-luc-accent/[0.32] bg-luc-accent-06 px-[11px] py-[9px]">
            <BillLogoTile icon={icon} logoUrl={logoUrl} size={34} iconSize={18} />
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
