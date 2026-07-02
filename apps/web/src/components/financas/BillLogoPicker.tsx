"use client"

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
 */
export function BillLogoPicker({
  billId,
  icon,
  logoUrl,
}: {
  billId: string
  icon: string
  logoUrl: string | null
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
