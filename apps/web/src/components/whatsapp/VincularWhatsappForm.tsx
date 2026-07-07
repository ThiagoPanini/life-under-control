"use client"

import Link from "next/link"
import { useActionState, useId, useState } from "react"
import { vincularMeuWhatsapp, type WhatsappFormState } from "@/app/(app)/whatsapp/actions"
import { WhatsAppGlyph } from "@/components/areas/WhatsAppGlyph"
import { Button } from "@/components/ds/Button"
import { inputClass } from "@/components/ds/FormField"
import { Pill } from "@/components/ds/Pill"
import { Surface } from "@/components/ds/Surface"
import { formatarTelefoneParaExibicao, mascararTelefoneEnquantoDigita } from "./telefone-mascara"

/**
 * Formulário de vínculo do próprio WhatsApp (issue #152, side quest de nav +
 * polish): vincular/trocar (mesmo campo, sobrescreve) sempre sobre a Pessoa
 * logada — nunca expõe um id de Pessoa a escolher. Remover vira link pro
 * modal de confirmação (`RemoverVinculoWhatsappModal`, `?remover=1`) — um
 * clique só era arriscado demais pra uma ação que corta o bot.
 */
export function VincularWhatsappForm({ whatsappPhone }: { whatsappPhone: string | null }) {
  const [state, formAction, pending] = useActionState<WhatsappFormState, FormData>(
    vincularMeuWhatsapp,
    {},
  )
  const id = useId()
  const [telefone, setTelefone] = useState(
    whatsappPhone ? formatarTelefoneParaExibicao(whatsappPhone) : "",
  )
  const vinculado = whatsappPhone != null

  return (
    <Surface className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
            vinculado ? "bg-luc-success/[0.14] text-luc-success" : "bg-white/[0.05] text-luc-text-3"
          }`}
        >
          <WhatsAppGlyph size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-luc-text">
            {vinculado
              ? formatarTelefoneParaExibicao(whatsappPhone)
              : "Nenhum número vinculado ainda"}
          </p>
          <p className="text-[12px] text-luc-text-3">
            {vinculado
              ? "O bot reconhece mensagens desse número."
              : "Vincule pra registrar comprovantes e receber lembretes no chat."}
          </p>
        </div>
        {vinculado && <Pill tone="success">vinculado</Pill>}
      </div>

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label htmlFor={`${id}-telefone`} className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="font-medium text-luc-text-2 text-sm">Número do WhatsApp</span>
          <input
            id={`${id}-telefone`}
            name="telefone"
            type="tel"
            inputMode="numeric"
            placeholder="(11) 91234-5678"
            value={telefone}
            onChange={(event) => setTelefone(mascararTelefoneEnquantoDigita(event.target.value))}
            aria-invalid={state.erro ? true : undefined}
            aria-describedby={state.erro ? `${id}-erro` : undefined}
            className={inputClass}
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : vinculado ? "Trocar" : "Vincular"}
        </Button>
      </form>

      {state.erro && (
        <p id={`${id}-erro`} role="alert" className="text-luc-warn text-sm">
          {state.erro}
        </p>
      )}

      {vinculado && (
        <Link
          href="/whatsapp?remover=1"
          scroll={false}
          className="self-start text-[12.5px] font-semibold text-luc-text-3 underline-offset-4 hover:text-luc-danger hover:underline"
        >
          Remover vínculo
        </Link>
      )}
    </Surface>
  )
}
