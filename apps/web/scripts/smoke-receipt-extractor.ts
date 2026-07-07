/**
 * Smoke do extrator de comprovante (ADR-0013, #156) — roda a extração REAL contra
 * o Bedrock sobre arquivos de verdade e imprime o `ReciboWhatsapp` já validado.
 * Reporta explicitamente a qualidade do `favorecido`, campo sem prior art no
 * backfill (é o sinal primário do matching da #162) — quantos recibos vieram com
 * favorecido legível, e qual.
 *
 * Não é teste automatizado: bate no Bedrock real (custa e exige credencial). Rode
 * à mão, da pasta apps/web, com AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION
 * no ambiente:
 *   node_modules/.bin/tsx scripts/smoke-receipt-extractor.ts               # 1 imagem + 1 PDF do RECIBOS_ROOT
 *   node_modules/.bin/tsx scripts/smoke-receipt-extractor.ts --todos       # todos os comprovantes achados
 *   node_modules/.bin/tsx scripts/smoke-receipt-extractor.ts a.jpg b.pdf   # arquivos explícitos
 *
 * Os bytes saem de `RECIBOS_ROOT` (env) ou do default do catálogo (OneDrive).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { bedrockReceiptExtractor } from "@/adapters/bedrock/bedrock-receipt-extractor"
import type { ReciboWhatsapp } from "@/core/domain/recibo-whatsapp"
import { RECIBOS_ROOT_DEFAULT, tipoMimeDe } from "./backfill-catalog"

const RECIBOS_ROOT = process.env.RECIBOS_ROOT ?? RECIBOS_ROOT_DEFAULT

/** Varre a raiz recursivamente e devolve todo comprovante (imagem ou PDF). */
function acharComprovantes(raiz: string): string[] {
  const achados: string[] = []
  for (const ent of readdirSync(raiz, { withFileTypes: true })) {
    const caminho = join(raiz, ent.name)
    if (ent.isDirectory()) {
      achados.push(...acharComprovantes(caminho))
    } else if (/\.(pdf|png|webp|jpe?g)$/i.test(ent.name)) {
      achados.push(caminho)
    }
  }
  return achados
}

/** Sem args: 1 imagem + 1 PDF (cobre os dois caminhos do adapter). */
function selecionar(argv: string[]): string[] {
  const explicitos = argv.filter((a) => a !== "--todos")
  if (explicitos.length > 0) return explicitos

  // Raiz ausente → devolve vazio pro guard amigável do main (não um ENOENT cru).
  if (!existsSync(RECIBOS_ROOT)) return []
  const todos = acharComprovantes(RECIBOS_ROOT)
  if (argv.includes("--todos")) return todos

  const pdf = todos.find((f) => tipoMimeDe(f) === "application/pdf")
  const imagem = todos.find((f) => tipoMimeDe(f) !== "application/pdf")
  return [imagem, pdf].filter((f): f is string => Boolean(f))
}

async function main(): Promise<void> {
  const arquivos = selecionar(process.argv.slice(2))
  if (arquivos.length === 0) {
    console.error(`Nenhum comprovante em ${RECIBOS_ROOT}. Passe arquivos ou defina RECIBOS_ROOT.`)
    process.exit(1)
  }

  const extrair = bedrockReceiptExtractor()
  const recibos: Array<{ arquivo: string; recibo: ReciboWhatsapp }> = []

  for (const arquivo of arquivos) {
    const bytes = readFileSync(arquivo)
    const tipoMime = tipoMimeDe(arquivo)
    process.stdout.write(`\n▶ ${basename(arquivo)} (${tipoMime})\n`)
    try {
      const recibo = await extrair(bytes, tipoMime)
      console.log(JSON.stringify(recibo, null, 2))
      recibos.push({ arquivo, recibo })
    } catch (e) {
      console.error(`  ✗ falhou: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Qualidade do favorecido — o campo sem prior art no backfill (#156).
  const comFavorecido = recibos.filter((r) => r.recibo.favorecido !== null)
  console.log(`\n── favorecido: ${comFavorecido.length}/${recibos.length} legível ──`)
  for (const { arquivo, recibo } of recibos) {
    console.log(`  ${basename(arquivo)} → ${recibo.favorecido ?? "(null)"}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
