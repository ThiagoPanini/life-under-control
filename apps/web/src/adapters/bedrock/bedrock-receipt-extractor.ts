import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk"
import { parseReciboWhatsapp } from "@/core/domain/recibo-whatsapp"
import { ehMimeComprovanteSuportado, type ReceiptExtractor } from "@/core/ports/receipt-extractor"

/**
 * Adapter do `ReceiptExtractor` (ADR-0013) — Claude no Bedrock lê o comprovante
 * por visão e devolve o recibo estruturado. Fino, sobre o `@anthropic-ai/bedrock-sdk`:
 * usa o caminho `InvokeModel` (`AnthropicBedrock`, não o Mantle) porque a
 * credencial IAM da #154 é escopada a `bedrock:InvokeModel` no ARN do inference
 * profile `us.anthropic.claude-opus-4-6-v1` (us-east-1) — o único que passou no
 * smoke real. A extração é **forçada por tool use** (`tool_choice`): o schema da
 * tool crava o shape, e o núcleo ainda **valida** o retorno com
 * `parseReciboWhatsapp` — o LLM extrai, não decide, e não é confiado.
 *
 * Nenhum teste automatizado bate aqui (a issue exige o adapter fora da malha); o
 * caminho real se valida pelo smoke script e em produção. Região e credencial
 * vêm do ambiente (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`),
 * resolvidas pela cadeia padrão do SDK — como o adapter R2.
 */

/** Inference profile confirmado por smoke real na #154 (ADR-0013). Sobrescrevível por env. */
const MODELO_PADRAO = "us.anthropic.claude-opus-4-6-v1"

const globalForBedrock = globalThis as unknown as { __lucBedrock?: AnthropicBedrock }

/**
 * Cliente Bedrock, singleton (cacheado no globalThis para sobreviver ao hot-reload
 * do dev). Região vem de `AWS_REGION`; a credencial, da cadeia AWS padrão.
 */
export function getBedrockClient(): AnthropicBedrock {
  if (!globalForBedrock.__lucBedrock) {
    globalForBedrock.__lucBedrock = new AnthropicBedrock()
  }
  return globalForBedrock.__lucBedrock
}

/** MIME de imagem que o bloco `image` do Anthropic aceita. */
type MimeImagem = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

/**
 * A tool que crava o shape do recibo — `tool_choice` a força, então a resposta é
 * sempre um `tool_use` com este `input`. Campo ilegível vem `null`, nunca palpite
 * (ADR-0013); o núcleo revalida centavos inteiros e datas ISO.
 */
const TOOL_RECIBO = {
  name: "registrar_recibo",
  description: "Registra os campos legíveis do comprovante de pagamento.",
  input_schema: {
    type: "object" as const,
    properties: {
      valorCentavos: {
        type: ["integer", "null"],
        description: "Valor pago em centavos inteiros (R$ 12,34 → 1234). null se ilegível.",
      },
      dataPagamento: {
        type: ["string", "null"],
        description: "Data em que o pagamento foi feito, ISO YYYY-MM-DD. null se ilegível.",
      },
      favorecido: {
        type: ["string", "null"],
        description: "Nome do favorecido/beneficiário do pagamento. null se ilegível.",
      },
      vencimentoImpresso: {
        type: ["string", "null"],
        description: "Vencimento estampado no documento, ISO YYYY-MM-DD. null se ausente.",
      },
      mesReferenciaImpresso: {
        type: ["string", "null"],
        description: "Mês de referência/competência estampado, YYYY-MM. null se ausente.",
      },
    },
    required: [
      "valorCentavos",
      "dataPagamento",
      "favorecido",
      "vencimentoImpresso",
      "mesReferenciaImpresso",
    ],
  },
}

const INSTRUCAO =
  "Extraia do comprovante apenas o que está legível. Valor em centavos inteiros " +
  "(R$ 12,34 → 1234). Datas em ISO (YYYY-MM-DD). Mês de referência em YYYY-MM. " +
  "Campo ilegível ou ausente é null — nunca invente nem deduza. Chame a tool " +
  "registrar_recibo com o resultado."

/**
 * Constrói o `ReceiptExtractor` sobre o Bedrock. `client` e `modelo` são
 * injetáveis; por padrão usam o singleton e o inference profile da #154.
 */
export function bedrockReceiptExtractor(
  client: AnthropicBedrock = getBedrockClient(),
  modelo: string = process.env.BEDROCK_MODEL_ID ?? MODELO_PADRAO,
): ReceiptExtractor {
  return async (conteudo, tipoMime) => {
    const ehPdf = tipoMime === "application/pdf"
    // Rejeita cedo o que a visão do Claude não aceita — melhor um erro claro aqui
    // do que um `media_type` inválido virar 400 opaco lá no Bedrock. Mesma fonte
    // (`MIMES_COMPROVANTE_SUPORTADOS`) que a borda pré-checa (#158).
    if (!ehMimeComprovanteSuportado(tipoMime)) {
      throw new Error(
        `tipo MIME não suportado: ${tipoMime} (esperado application/pdf ou image/{jpeg,png,webp,gif})`,
      )
    }

    const data = Buffer.from(conteudo).toString("base64")
    // PDF entra como bloco `document`; imagem, como bloco `image` (ADR-0013).
    const documento = ehPdf
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data },
        }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: tipoMime as MimeImagem, data },
        }

    const resposta = await client.messages.create({
      model: modelo,
      max_tokens: 1024,
      tools: [TOOL_RECIBO],
      tool_choice: { type: "tool", name: "registrar_recibo" },
      messages: [{ role: "user", content: [documento, { type: "text", text: INSTRUCAO }] }],
    })

    // Truncou (max_tokens): o tool input veio parcial e campos faltando virariam
    // `null` no parse — um recibo legível degradaria a "ilegível" em silêncio.
    // Falha alto: extração incompleta não é confiável (ADR-0013).
    if (resposta.stop_reason === "max_tokens") {
      throw new Error("extração do comprovante truncada (max_tokens): recibo incompleto")
    }

    const bloco = resposta.content.find((b) => b.type === "tool_use")
    if (bloco?.type !== "tool_use") {
      throw new Error("extração do comprovante não retornou a tool registrar_recibo")
    }
    return parseReciboWhatsapp(bloco.input)
  }
}
