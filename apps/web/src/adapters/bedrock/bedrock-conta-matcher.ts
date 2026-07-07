import type { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk"
import type { ContaCandidata, ContaMatcher } from "@/core/ports/conta-matcher"
import { getBedrockClient } from "./bedrock-receipt-extractor"

/**
 * Adapter do `ContaMatcher` (revisa ADR-0013) — Claude no Bedrock casa o
 * favorecido do comprovante às Contas do Lar por conhecimento de mundo (ENEL →
 * "Luz", SABESP → "Água", VIVO → "Internet"): similaridade de string nunca faz
 * essa ponte. Chamada de **texto** (sem imagem — mais barata que o extrator de
 * visão), com o casamento **forçado por tool use**. O núcleo ainda filtra os ids
 * ao conjunto oferecido: o LLM ordena, não inventa Conta (ADR-0013, "não confie
 * no adapter").
 *
 * Reusa o inference profile e o client singleton do extrator (#154). Nenhum teste
 * automatizado bate aqui (adapter fora da malha, como o extrator); o caminho real
 * se valida no smoke e em produção.
 */

/** Mesmo inference profile da #154; sobrescrevível por env (igual ao extrator). */
const MODELO_PADRAO = "us.anthropic.claude-opus-4-6-v1"

const TOOL_ORDENAR = {
  name: "ordenar_contas",
  description:
    "Ordena as Contas do Lar da mais provável à menos provável de ser o destino do pagamento.",
  input_schema: {
    type: "object" as const,
    properties: {
      contaIdsOrdenadas: {
        type: "array" as const,
        items: { type: "string" as const },
        description:
          "IDs das Contas plausíveis, da mais provável à menos provável. Lista vazia se nenhuma serve.",
      },
    },
    required: ["contaIdsOrdenadas"],
  },
}

function instrucao(favorecido: string, candidatas: ContaCandidata[]): string {
  const lista = candidatas.map((c) => `- id=${c.billId} · nome="${c.nome}"`).join("\n")
  return (
    `Um comprovante de pagamento tem como favorecido/beneficiário: "${favorecido}".\n` +
    `As Contas do Lar são:\n${lista}\n\n` +
    "Usando conhecimento de mundo (ex.: ENEL/CPFL/Light/Neoenergia = energia " +
    "elétrica; SABESP/Sanepar/Copasa/Cedae = água; VIVO/Claro/TIM/Oi/NET = " +
    "telefone/internet; Comgás/Naturgy = gás), ordene os ids das Contas da mais " +
    "provável à menos provável de ser o destino desse pagamento. Inclua só as " +
    "plausíveis; se nenhuma servir, devolva lista vazia — nunca chute. Chame a " +
    "tool ordenar_contas."
  )
}

/**
 * Constrói o `ContaMatcher` sobre o Bedrock. `client` e `modelo` são injetáveis;
 * por padrão usam o singleton e o inference profile da #154.
 */
export function bedrockContaMatcher(
  client: AnthropicBedrock = getBedrockClient(),
  modelo: string = process.env.BEDROCK_MODEL_ID ?? MODELO_PADRAO,
): ContaMatcher {
  return async (favorecido, candidatas) => {
    // Sem favorecido ou sem Conta candidata não há o que casar — poupa a chamada.
    if (favorecido == null || candidatas.length === 0) return []

    const resposta = await client.messages.create({
      model: modelo,
      max_tokens: 512,
      tools: [TOOL_ORDENAR],
      tool_choice: { type: "tool", name: "ordenar_contas" },
      messages: [
        { role: "user", content: [{ type: "text", text: instrucao(favorecido, candidatas) }] },
      ],
    })

    // Truncou (max_tokens): o ranking veio parcial; tratá-lo como válido faria
    // um casamento óbvio degradar a abstenção em silêncio. Falha alto — a borda
    // captura e degrada pra "tente de novo" (mesma guarda do extrator, #156).
    if (resposta.stop_reason === "max_tokens") {
      throw new Error("ordenação de Conta truncada (max_tokens): ranking incompleto")
    }

    const bloco = resposta.content.find((b) => b.type === "tool_use")
    if (bloco?.type !== "tool_use") return []

    const ids = (bloco.input as { contaIdsOrdenadas?: unknown }).contaIdsOrdenadas
    if (!Array.isArray(ids)) return []

    // O núcleo não confia no adapter: só ids do conjunto oferecido, sem repetição.
    const oferecidas = new Set(candidatas.map((c) => c.billId))
    const ordenados: string[] = []
    for (const id of ids) {
      if (typeof id === "string" && oferecidas.has(id) && !ordenados.includes(id)) {
        ordenados.push(id)
      }
    }
    return ordenados
  }
}
