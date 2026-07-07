/**
 * Classificação pura do payload do webhook da Meta (ADR-0012, issue #155). O
 * POST recebe mensagem, status (delivered/read) e eventos de template no
 * mesmo formato de envelope — roteia sem quebrar em forma inesperada.
 */

export type EventoWebhook =
  | { tipo: "mensagem"; waMessageId: string; remetente: string; texto: string | null }
  | { tipo: "status" }
  | { tipo: "template" }
  | { tipo: "desconhecido" }

type MensagemBruta = { id?: unknown; from?: unknown; type?: unknown; text?: { body?: unknown } }
type ValorBruto = {
  messages?: MensagemBruta[]
  statuses?: unknown[]
  message_template_status_update?: unknown
}

function classificarValor(value: ValorBruto): EventoWebhook[] {
  if (Array.isArray(value.messages) && value.messages.length > 0) {
    return value.messages.map((m) => ({
      tipo: "mensagem",
      waMessageId: String(m.id ?? ""),
      remetente: String(m.from ?? ""),
      texto: m.type === "text" && typeof m.text?.body === "string" ? m.text.body : null,
    }))
  }

  if (Array.isArray(value.statuses) && value.statuses.length > 0) return [{ tipo: "status" }]

  if (value.message_template_status_update) return [{ tipo: "template" }]

  return [{ tipo: "desconhecido" }]
}

/** Classifica um payload bruto do webhook em uma lista de eventos — nunca lança. */
export function classificarEventoWebhook(payloadBruto: unknown): EventoWebhook[] {
  if (typeof payloadBruto !== "object" || payloadBruto === null) return [{ tipo: "desconhecido" }]

  const entry = (payloadBruto as { entry?: unknown }).entry
  if (!Array.isArray(entry) || entry.length === 0) return [{ tipo: "desconhecido" }]

  const eventos = entry.flatMap((e) => {
    const changes = (e as { changes?: unknown }).changes
    if (!Array.isArray(changes) || changes.length === 0) return []

    return changes.flatMap((c) => {
      const value = (c as { value?: unknown }).value
      if (typeof value !== "object" || value === null) return []
      return classificarValor(value as ValorBruto)
    })
  })

  return eventos.length > 0 ? eventos : [{ tipo: "desconhecido" }]
}
