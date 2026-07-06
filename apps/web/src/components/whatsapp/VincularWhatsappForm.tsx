"use client"

import { useActionState, useId } from "react"
import {
  desvincularMeuWhatsapp,
  vincularMeuWhatsapp,
  type WhatsappFormState,
} from "@/app/(app)/whatsapp/actions"
import { Button } from "@/components/ds/Button"
import { inputClass } from "@/components/ds/FormField"

/**
 * Formulário de vínculo do próprio WhatsApp (issue #152): vincular/trocar
 * (mesmo campo, sobrescreve) e remover, sempre sobre a Pessoa logada — nunca
 * expõe um id de Pessoa a escolher.
 */
export function VincularWhatsappForm({ whatsappPhone }: { whatsappPhone: string | null }) {
  const [state, formAction, pending] = useActionState<WhatsappFormState, FormData>(
    vincularMeuWhatsapp,
    {},
  )
  const id = useId()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-luc-text-2 text-sm">
        {whatsappPhone ? `Vinculado: ${whatsappPhone}` : "Nenhum número vinculado ainda."}
      </p>

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label htmlFor={`${id}-telefone`} className="flex flex-col gap-1.5">
          <span className="font-medium text-luc-text-2 text-sm">Número do WhatsApp</span>
          <input
            key={whatsappPhone ?? "sem-vinculo"}
            id={`${id}-telefone`}
            name="telefone"
            type="tel"
            placeholder="(11) 98765-4321"
            defaultValue={whatsappPhone ?? ""}
            className={inputClass}
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : whatsappPhone ? "Trocar" : "Vincular"}
        </Button>
      </form>

      {state.erro && (
        <p role="alert" className="text-luc-warn text-sm">
          {state.erro}
        </p>
      )}

      {whatsappPhone && (
        <form action={desvincularMeuWhatsapp}>
          <Button variant="secondary" type="submit" className="self-start">
            Remover vínculo
          </Button>
        </form>
      )}
    </div>
  )
}
