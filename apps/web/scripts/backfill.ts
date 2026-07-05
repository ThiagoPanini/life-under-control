/**
 * Borda de ingestão do backfill histórico (issue #24). Lê a planilha de controle
 * (já exportada a JSON) e os recibos extraídos pelo passe de visão, casa um com o
 * outro pelo cross-check do núcleo (`construirManifesto`), e — em `--commit` —
 * cadastra as Contas que faltam e importa os Lançamentos pelos use-cases, subindo
 * os comprovantes pro R2. Sem `--commit` é **dry-run**: só monta e imprime o
 * manifesto pra conferência (nenhuma escrita).
 *
 * Uso (da pasta apps/web):
 *   node_modules/.bin/tsx scripts/backfill.ts            # dry-run (revisão)
 *   node_modules/.bin/tsx scripts/backfill.ts --commit   # cadastra Contas + importa
 *
 * Entradas (em `<repo>/.backfill/`, gitignored):
 *   controle.json        — linhas da planilha [{comp, cat, status, valorCents}]
 *   recibos/<conta>.json — saída do passe de visão [{arquivo, dataPagamento, valorCentavos}]
 * Os bytes dos comprovantes saem de `RECIBOS_ROOT` (env) ou do default do catálogo.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzleAttachmentRepo } from "@/adapters/db/attachment-repo.drizzle"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { getDb } from "@/adapters/db/client"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import {
  billBrutoDeConta,
  competenciaDoRecibo,
  construirManifesto,
  type LinhaManifesto,
  type LinhaPlanilha,
  lerNomeRecibo,
  primeiraCompetenciaDe,
  type ReciboExtraido,
} from "@/core/domain/backfill"
import { createBill } from "@/core/use-cases/create-bill"
import { importBackfill } from "@/core/use-cases/import-backfill"
import {
  CATALOGO,
  chaveCategoria,
  HOUSEHOLD,
  RECIBOS_ROOT_DEFAULT,
  tipoMimeDe,
} from "./backfill-catalog"

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptsDir, "../../..")
const dataDir = join(repoRoot, ".backfill")
const RECIBOS_ROOT = process.env.RECIBOS_ROOT ?? RECIBOS_ROOT_DEFAULT

/**
 * Marcador da guarda anti-double-shift (#124): presente na raiz de comprovantes,
 * os nomes já são a competência-verdade e a leitura NÃO traduz pelo offset legado.
 * A raiz do OneDrive nunca o terá (originais intocados, nomes defasados).
 */
export const MARCADOR_CORRECAO = ".competencia-corrigida.json"

/** Linha da planilha como exportada do xlsx. */
type LinhaControle = { comp: string; cat: string; status: string; valorCents: number }
/** Recibo como o passe de visão o emitiu (v2 soma os campos impressos, opcionais). */
type ReciboVisao = {
  arquivo: string
  dataPagamento: string | null
  valorCentavos: number | null
  /** Vencimento estampado no documento (YYYY-MM-DD), quando legível — recibos v2 (#124). */
  vencimentoImpresso?: string | null
  /** Mês/período de referência estampado (YYYY-MM), quando o documento o traz. */
  mesReferenciaImpresso?: string | null
}

function lerJson<T>(caminho: string): T {
  return JSON.parse(readFileSync(caminho, "utf8")) as T
}

/** Junta os recibos de todos os `recibos/<conta>.json` num só array. */
function lerRecibos(): ReciboVisao[] {
  const dir = join(dataDir, "recibos")
  const todos: ReciboVisao[] = []
  for (const arq of readdirSync(dir)) {
    if (!arq.endsWith(".json")) continue
    todos.push(...lerJson<ReciboVisao[]>(join(dir, arq)))
  }
  return todos
}

/** O offset legado de nomenclatura de cada pasta de comprovantes (0 = nome já é a verdade). */
const OFFSET_POR_SLUG = new Map(
  CATALOGO.filter((c) => c.dirSlug).map((c) => [c.dirSlug as string, c.offsetNomeLegado ?? 0]),
)

/**
 * Indexa os recibos por slug da pasta (a Conta de origem), já como `ReciboExtraido`
 * — com a competência **traduzida** pelo offset legado da Conta quando a raiz é
 * legada (`raizCorrigida` vem do marcador `.competencia-corrigida.json`).
 */
function recibosPorConta(
  recibos: ReciboVisao[],
  raizCorrigida: boolean,
): Map<string, ReciboExtraido[]> {
  const por = new Map<string, ReciboExtraido[]>()
  for (const r of recibos) {
    const nome = lerNomeRecibo(r.arquivo)
    if (!nome) {
      console.warn(`  ⚠ recibo ignorado (nome sem competência): ${r.arquivo}`)
      continue
    }
    const offset = OFFSET_POR_SLUG.get(nome.contaSlug) ?? 0
    const traduzido = competenciaDoRecibo(r.arquivo, offset, raizCorrigida)
    if (!traduzido) continue
    const extraido: ReciboExtraido = {
      arquivo: r.arquivo,
      competencia: traduzido.competencia,
      dataPagamento: r.dataPagamento,
      valorRecibo: r.valorCentavos,
      tipoMime: tipoMimeDe(r.arquivo),
      vencimentoImpresso: r.vencimentoImpresso ?? null,
      mesReferenciaImpresso: r.mesReferenciaImpresso ?? null,
    }
    const lista = por.get(nome.contaSlug) ?? []
    lista.push(extraido)
    por.set(nome.contaSlug, lista)
  }
  return por
}

/** Indexa as linhas da planilha por chave de categoria (sem emoji). */
function planilhaPorCategoria(linhas: LinhaControle[]): Map<string, LinhaPlanilha[]> {
  const por = new Map<string, LinhaPlanilha[]>()
  for (const l of linhas) {
    const chave = chaveCategoria(l.cat)
    const lista = por.get(chave) ?? []
    lista.push({ competencia: l.comp, valorCentavos: l.valorCents, status: l.status })
    por.set(chave, lista)
  }
  return por
}

/** Carrega os bytes de um comprovante do disco do operador (a fronteira de IO). */
async function carregarRecibo(arquivo: string) {
  try {
    const conteudo = await readFile(join(RECIBOS_ROOT, arquivo))
    return { conteudo: new Uint8Array(conteudo), tipoMime: tipoMimeDe(arquivo) }
  } catch {
    console.warn(`  ⚠ comprovante inacessível (segue sem anexo): ${arquivo}`)
    return null
  }
}

async function main() {
  const commit = process.argv.includes("--commit")
  console.log(`\n=== Backfill Finanças (#24) — ${commit ? "COMMIT" : "DRY-RUN"} ===\n`)

  const raizCorrigida = existsSync(join(RECIBOS_ROOT, MARCADOR_CORRECAO))
  console.log(
    raizCorrigida
      ? "  Raiz corrigida (marcador presente): nomes lidos como estão, sem tradução.\n"
      : "  Raiz legada: nome → competência traduzido pelo offset legado do catálogo.\n",
  )

  const controle = lerJson<LinhaControle[]>(join(dataDir, "controle.json"))
  const recibos = recibosPorConta(lerRecibos(), raizCorrigida)
  const planilha = planilhaPorCategoria(controle)

  // Resolve o billId de cada Conta: em commit cadastra (idempotente por nome); em
  // dry-run usa o slug como id-fantasma, só pra montar o manifesto pra revisão.
  const billIdPorLabel = new Map<string, string>()
  if (commit) {
    const billRepo = drizzleBillRepo(getDb())
    const existentes = await billRepo.listarBills(HOUSEHOLD)
    const porNome = new Map(existentes.map((b) => [b.nome, b.id]))
    for (const c of CATALOGO) {
      const jaTem = porNome.get(c.nome)
      if (jaTem) {
        billIdPorLabel.set(c.label, jaTem)
        console.log(`  Conta já existe: ${c.nome} (${jaTem})`)
      } else {
        // Conta nova: a primeira competência sai da menor linha paga da planilha
        // (mesma regra da migração 0008); sem histórico, o mês corrente.
        const mesCorrente = new Date().toISOString().slice(0, 7)
        const primeira = primeiraCompetenciaDe(planilha.get(c.label) ?? [], mesCorrente)
        const nova = await createBill(billRepo, HOUSEHOLD, billBrutoDeConta(c, primeira))
        billIdPorLabel.set(c.label, nova.id)
        console.log(`  Conta cadastrada: ${c.nome} (${nova.id})`)
      }
    }
  } else {
    for (const c of CATALOGO) billIdPorLabel.set(c.label, `slug:${c.label}`)
  }

  // Monta o manifesto por Conta, casando planilha × recibos.
  const manifesto: LinhaManifesto[] = []
  for (const c of CATALOGO) {
    const billId = billIdPorLabel.get(c.label) as string
    const linhas = construirManifesto({
      billId,
      paidBy: c.paidBy,
      planilha: planilha.get(c.label) ?? [],
      recibos: c.dirSlug ? (recibos.get(c.dirSlug) ?? []) : [],
    })
    manifesto.push(...linhas)
    const aImportar = linhas.filter((l) => !l.revisar)
    const comData = aImportar.filter((l) => l.dataPagamento).length
    const emRevisao = linhas.length - aImportar.length
    console.log(
      `  ${c.nome.padEnd(18)} → ${String(aImportar.length).padStart(2)} a importar ` +
        `(${comData} c/ data, ${aImportar.length - comData} sem data), ${emRevisao} em revisão`,
    )
  }

  // O manifesto completo, conferível, como artefato (arquivo → conta, competência,
  // data, valor, flags) — o que a AC do #24 pede gerar.
  writeFileSync(join(dataDir, "manifest.json"), `${JSON.stringify(manifesto, null, 2)}\n`)
  console.log(
    `\n  Manifesto completo escrito em .backfill/manifest.json (${manifesto.length} linhas)`,
  )

  const aImportar = manifesto.filter((l) => !l.revisar)
  const emRevisao = manifesto.filter((l) => l.revisar)
  console.log(
    `\n  TOTAL: ${manifesto.length} linhas — ${aImportar.length} a importar, ` +
      `${emRevisao.length} em revisão`,
  )

  if (emRevisao.length > 0) {
    console.log("\n  --- Em revisão (não inseridos) ---")
    for (const l of emRevisao) {
      console.log(
        `  [${l.flags.join(",")}] ${l.billId} ${l.competencia} R$${(l.valor / 100).toFixed(2)} ${l.recibo?.arquivo ?? ""}`,
      )
    }
  }

  if (!commit) {
    console.log("\n  Dry-run: nada foi escrito. Rode com --commit para cadastrar e importar.\n")
    return
  }

  console.log("\n  Importando...")
  const resultado = await importBackfill(
    drizzlePaymentRepo(getDb()),
    r2AttachmentStore(),
    drizzleAttachmentRepo(getDb()),
    carregarRecibo,
    HOUSEHOLD,
    manifesto,
  )
  console.log(
    `\n  Importados: ${resultado.criados.length} · pulados (idempotência): ${resultado.pulados} · ` +
      `anexos no R2: ${resultado.anexos} · em revisão: ${resultado.emRevisao.length} · ` +
      `inválidos: ${resultado.invalidos.length} · falhas de anexo: ${resultado.falhasAnexo.length}\n`,
  )

  if (resultado.falhasAnexo.length > 0) {
    console.log(
      "  --- Falhas de anexo (Lançamento entrou sem comprovante — re-rode pra reparar) ---",
    )
    for (const l of resultado.falhasAnexo) {
      console.log(`  ${l.billId} ${l.competencia} ${l.recibo?.arquivo ?? ""}`)
    }
    console.log("")
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
