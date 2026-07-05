/**
 * Correção de Competência do histórico (#124) — a borda operada da #125. Lê os
 * recibos v2 (com vencimento impresso), diagnostica a defasagem por Conta, e —
 * mediante a adjudicação do operador (Gate 1) — emite o plano de correção. Sem
 * `--commit` é **dry-run**: imprime diagnóstico, tabela de adjudicação e o plano
 * completo, sem escrever nada. Com `--commit` aplica: UPDATEs pelas ports
 * (competências, regra de vencimento, primeira competência, nomes de Anexo,
 * encerramento do DAS), renomeia os comprovantes da raiz de trabalho, grava o
 * marcador anti-double-shift e regenera os JSONs do `.backfill/` coerentes.
 *
 * Uso (da pasta apps/web):
 *   node_modules/.bin/tsx scripts/backfill-correcao.ts            # dry-run
 *   node_modules/.bin/tsx scripts/backfill-correcao.ts --commit   # aplica + verifica
 *
 * Entradas:
 *   .backfill/controle.json + recibos/<conta>.json — os dados da rodada (gitignored)
 *   .backfill/adjudicacao.json — as regras do Gate 1; sem ele o script grava uma
 *     proposta (adjudicacao.proposta.json) derivada do diagnóstico e para.
 *   env RECIBOS_ROOT — a raiz de TRABALHO dos comprovantes (default: tmp/financas/
 *     pagamentos-recorrentes/contas do repo). NUNCA aponte para o OneDrive: os
 *     originais ficam intocados para sempre; renomear lá é proibido e o script
 *     recusa a raiz legada default por segurança.
 *
 * Idempotência em três camadas: prod pelo conjunto-verdade (plano vazio quando já
 * corrigido), arquivos pelo marcador `.competencia-corrigida.json` na raiz, e
 * `.backfill/` pelo marcador `correcao-aplicada.json`. Segundo `--commit` = no-op.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzleAttachmentRepo } from "@/adapters/db/attachment-repo.drizzle"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { getDb } from "@/adapters/db/client"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import {
  construirManifesto,
  type LinhaPlanilha,
  lerNomeRecibo,
  type ReciboExtraido,
  somarMeses,
} from "@/core/domain/backfill"
import {
  diagnosticarConta,
  type EstadoContaCorrecao,
  type PlanoCorrecaoConta,
  planejarCorrecaoConta,
  planejarRenamesArquivos,
  tabelaDeAdjudicacao,
} from "@/core/domain/backfill-correcao"
import { aplicarCorrecaoBackfill } from "@/core/use-cases/aplicar-correcao-backfill"
import { CATALOGO, chaveCategoria, HOUSEHOLD, RECIBOS_ROOT_DEFAULT } from "./backfill-catalog"

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptsDir, "../../..")
const dataDir = join(repoRoot, ".backfill")

/** A raiz de trabalho (cópia dos comprovantes que PODE ser renomeada). */
const WORK_ROOT =
  process.env.RECIBOS_ROOT ?? join(repoRoot, "tmp/financas/pagamentos-recorrentes/contas")
const MARCADOR_RAIZ = ".competencia-corrigida.json"
const MARCADOR_BACKFILL = "correcao-aplicada.json"
const ARQ_ADJUDICACAO = join(dataDir, "adjudicacao.json")
const ARQ_PROPOSTA = join(dataDir, "adjudicacao.proposta.json")

/** Linha crua do controle.json — campos além do tipado são preservados na regeneração. */
type LinhaControleRaw = { comp: string; cat: string; status: string; valorCents: number } & Record<
  string,
  unknown
>

/** Recibo como o passe de visão v2 o emitiu (campos impressos opcionais). */
type ReciboVisao = {
  arquivo: string
  dataPagamento: string | null
  valorCentavos: number | null
  vencimentoImpresso?: string | null
  mesReferenciaImpresso?: string | null
} & Record<string, unknown>

/** Uma regra adjudicada no Gate 1, por rótulo de Conta do catálogo. */
type AdjudicacaoConta = {
  label: string
  shift: number
  dueMonthOffsetAlvo: number
  dueRuleDayAlvo: number | null
  encerrarEm: string | null
}

function lerJson<T>(caminho: string): T {
  return JSON.parse(readFileSync(caminho, "utf8")) as T
}

function escreverJson(caminho: string, valor: unknown) {
  writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`)
}

/** Recibos por arquivo-fonte (`recibos/<conta>.json`), preservando o agrupamento. */
function lerRecibosPorArquivoJson(): Map<string, ReciboVisao[]> {
  const dir = join(dataDir, "recibos")
  const por = new Map<string, ReciboVisao[]>()
  for (const arq of readdirSync(dir)) {
    if (!arq.endsWith(".json")) continue
    por.set(arq, lerJson<ReciboVisao[]>(join(dir, arq)))
  }
  return por
}

/** Soma `shift` meses a um campo `YYYY-MM` ou `YYYY-MM-DD`, preservando o resto. */
function shiftCampo(valor: string, shift: number): string {
  if (!/^\d{4}-\d{2}/.test(valor)) return valor
  return `${somarMeses(valor.slice(0, 7), shift)}${valor.slice(7)}`
}

function centavos(v: number | null): string {
  return v === null ? "—" : `R$${(v / 100).toFixed(2)}`
}

async function main() {
  const commit = process.argv.includes("--commit")
  console.log(`\n=== Correção de Competência (#124) — ${commit ? "COMMIT" : "DRY-RUN"} ===\n`)

  const raizCorrigida = existsSync(join(WORK_ROOT, MARCADOR_RAIZ))
  const backfillCorrigido = existsSync(join(dataDir, MARCADOR_BACKFILL))
  console.log(`  Raiz de trabalho: ${WORK_ROOT}`)
  console.log(`  Camada arquivos: ${raizCorrigida ? "já corrigida (marcador)" : "legada"}`)
  console.log(`  Camada .backfill/: ${backfillCorrigido ? "já corrigida (marcador)" : "legada"}\n`)

  const controle = lerJson<LinhaControleRaw[]>(join(dataDir, "controle.json"))
  const recibosPorJson = lerRecibosPorArquivoJson()
  const todosRecibos = [...recibosPorJson.values()].flat()

  // Recibos crus por slug: a competência AINDA é a do nome (sem tradução) — o
  // diagnóstico existe exatamente para confrontar o nome com o vencimento impresso.
  const crusPorSlug = new Map<string, ReciboExtraido[]>()
  for (const r of todosRecibos) {
    const nome = lerNomeRecibo(r.arquivo)
    if (!nome) continue
    const lista = crusPorSlug.get(nome.contaSlug) ?? []
    lista.push({
      arquivo: r.arquivo,
      competencia: nome.competencia,
      dataPagamento: r.dataPagamento,
      valorRecibo: r.valorCentavos,
      tipoMime: "image/jpeg",
      vencimentoImpresso: r.vencimentoImpresso ?? null,
      mesReferenciaImpresso: r.mesReferenciaImpresso ?? null,
    })
    crusPorSlug.set(nome.contaSlug, lista)
  }

  // ── Diagnóstico por Conta (evidência documental) ──────────────────────────────
  console.log("  --- Diagnóstico (nome do arquivo × vencimento impresso) ---")
  const diagnosticos = new Map<string, ReturnType<typeof diagnosticarConta>>()
  for (const c of CATALOGO) {
    if (!c.dirSlug) continue
    const d = diagnosticarConta(c.dirSlug, crusPorSlug.get(c.dirSlug) ?? [])
    diagnosticos.set(c.label, d)
    console.log(
      `  ${c.nome.padEnd(18)} → recibos ${String(d.totalRecibos).padStart(3)} · ` +
        `evidência ${String(d.comVencimentoImpresso).padStart(3)} · ` +
        `offset ${d.offsetObservado ?? "?"} · dueDay ${d.dueDayObservado ?? "?"} · ` +
        `exceções ${d.excecoes.length}`,
    )
    for (const e of d.excecoes) {
      console.log(
        `      ⚠ ${e.arquivo}: offset ${e.offsetDoArquivo}, venc ${e.vencimentoImpresso}` +
          `${e.mesReferenciaImpresso ? `, ref ${e.mesReferenciaImpresso}` : ""}`,
      )
    }
  }

  // ── Adjudicação (Gate 1) ──────────────────────────────────────────────────────
  if (!existsSync(ARQ_ADJUDICACAO)) {
    const proposta: AdjudicacaoConta[] = CATALOGO.map((c) => {
      const d = c.dirSlug ? diagnosticos.get(c.label) : undefined
      const shift = Math.max(d?.offsetObservado ?? c.offsetNomeLegado ?? 0, 0)
      return {
        label: c.label,
        shift,
        dueMonthOffsetAlvo: 0,
        dueRuleDayAlvo: d?.dueDayObservado ?? null,
        // Decisão do grilling de 04/07/2026: o DAS Jakeline foi pontual — encerra.
        encerrarEm: c.label === "DAS Jake" ? "2025-10-31" : null,
      }
    })
    escreverJson(ARQ_PROPOSTA, proposta)
    console.log(
      `\n  Gate 1: não há ${ARQ_ADJUDICACAO}.\n` +
        `  Proposta derivada do diagnóstico escrita em ${ARQ_PROPOSTA}.\n` +
        "  Revise/edite, salve como adjudicacao.json e rode de novo.\n",
    )
    return
  }
  const adjudicacao = lerJson<AdjudicacaoConta[]>(ARQ_ADJUDICACAO)
  const adjPorLabel = new Map(adjudicacao.map((a) => [a.label, a]))

  // ── Tabela de adjudicação (exceções do cross-check, com a tradução adjudicada) ──
  const planilhaPorLabel = new Map<string, LinhaPlanilha[]>()
  for (const l of controle) {
    const chave = chaveCategoria(l.cat)
    const lista = planilhaPorLabel.get(chave) ?? []
    lista.push({ competencia: l.comp, valorCentavos: l.valorCents, status: l.status })
    planilhaPorLabel.set(chave, lista)
  }
  const excecoesManifesto = CATALOGO.flatMap((c) => {
    const shift = adjPorLabel.get(c.label)?.shift ?? 0
    const planilha = (planilhaPorLabel.get(c.label) ?? []).map((l) =>
      backfillCorrigido || shift === 0
        ? l
        : { ...l, competencia: somarMeses(l.competencia, shift) },
    )
    const recibos = (c.dirSlug ? (crusPorSlug.get(c.dirSlug) ?? []) : []).map((r) =>
      raizCorrigida || shift === 0 ? r : { ...r, competencia: somarMeses(r.competencia, shift) },
    )
    return tabelaDeAdjudicacao(
      construirManifesto({ billId: c.label, paidBy: c.paidBy, planilha, recibos }),
    )
  })
  if (excecoesManifesto.length > 0) {
    console.log("\n  --- Tabela de adjudicação (cross-check pós-tradução) ---")
    for (const e of excecoesManifesto) {
      console.log(
        `  [${e.motivo}] ${e.billId} ${e.competencia} planilha ${centavos(e.valorPlanilha)} × ` +
          `recibo ${centavos(e.valorRecibo)} ${e.arquivo ?? ""}`,
      )
    }
  }

  // ── Estado de prod + plano por Conta ──────────────────────────────────────────
  const db = getDb()
  const billRepo = drizzleBillRepo(db)
  const paymentRepo = drizzlePaymentRepo(db)
  const attachmentRepo = drizzleAttachmentRepo(db)

  const bills = await billRepo.listarBills(HOUSEHOLD)
  const billPorNome = new Map(bills.map((b) => [b.nome, b]))

  const planos: PlanoCorrecaoConta[] = []
  const renames: { de: string; para: string }[] = []
  let paymentsAntes = 0

  console.log("\n  --- Plano por Conta ---")
  for (const c of CATALOGO) {
    const adj = adjPorLabel.get(c.label)
    if (!adj) {
      console.log(`  ${c.nome.padEnd(18)} → sem regra na adjudicação; pulada`)
      continue
    }
    const bill = billPorNome.get(c.nome)
    if (!bill) {
      console.log(`  ${c.nome.padEnd(18)} → Conta não existe em prod; pulada (cadastro é do #24)`)
      continue
    }

    const payments = await paymentRepo.listarPayments(HOUSEHOLD, bill.id)
    paymentsAntes += payments.length
    const attachments = await attachmentRepo.listarAttachmentsPorPayments(
      HOUSEHOLD,
      payments.map((p) => p.id),
    )
    const estado: EstadoContaCorrecao = {
      bill: {
        id: bill.id,
        dueMonthOffset: bill.dueMonthOffset,
        dueRuleDay: bill.dueRule.kind === "dia-fixo" ? bill.dueRule.day : null,
        primeiraCompetencia: bill.primeiraCompetencia,
        estado: bill.estado,
      },
      payments: payments.map((p) => ({ id: p.id, competencia: p.competencia })),
      attachments: attachments.map((a) => ({
        id: a.id,
        paymentId: a.paymentId,
        nomeOriginal: a.nomeOriginal,
      })),
    }

    // O conjunto-verdade: planilha ∪ recibos, ambos na competência real (a camada
    // ainda legada é traduzida pelo shift adjudicado; a corrigida entra como está).
    const verdade = new Set<string>()
    for (const l of planilhaPorLabel.get(c.label) ?? []) {
      if (l.status !== "Pago") continue
      verdade.add(
        backfillCorrigido || adj.shift === 0 ? l.competencia : somarMeses(l.competencia, adj.shift),
      )
    }
    for (const r of c.dirSlug ? (crusPorSlug.get(c.dirSlug) ?? []) : []) {
      verdade.add(
        raizCorrigida || adj.shift === 0 ? r.competencia : somarMeses(r.competencia, adj.shift),
      )
    }

    const plano = planejarCorrecaoConta(
      {
        billId: bill.id,
        shift: adj.shift,
        dueMonthOffsetAlvo: adj.dueMonthOffsetAlvo,
        dueRuleDayAlvo: adj.dueRuleDayAlvo,
        encerrarEm: adj.encerrarEm,
      },
      estado,
      [...verdade].sort(),
    )
    planos.push(plano)

    const resumoBill = plano.billUpdate ? JSON.stringify(plano.billUpdate) : "—"
    console.log(
      `  ${c.nome.padEnd(18)} → ${plano.situacao.padEnd(13)} · payments ${plano.paymentUpdates.length} · ` +
        `anexos ${plano.attachmentRenames.length} · bill ${resumoBill} · ` +
        `encerra ${plano.encerramento?.encerradaEm ?? "—"}`,
    )
    for (const a of plano.avisos) console.log(`      ⚠ ${a}`)
    for (const u of plano.paymentUpdates.slice(0, 3))
      console.log(`      ${u.de} → ${u.para} (${u.paymentId})`)
    if (plano.paymentUpdates.length > 3)
      console.log(`      … +${plano.paymentUpdates.length - 3} Lançamentos`)

    // Renames da raiz de trabalho: mesma defasagem, mesma guarda.
    if (c.dirSlug && adj.shift !== 0) {
      const arquivos = (crusPorSlug.get(c.dirSlug) ?? []).map((r) => r.arquivo)
      renames.push(...planejarRenamesArquivos(arquivos, adj.shift, raizCorrigida))
    }
  }

  const pendentes = planos.filter((p) => p.situacao === "pendente")
  const inconsistentes = planos.filter((p) => p.situacao === "inconsistente")
  console.log(
    `\n  TOTAL: ${planos.length} Contas — ${pendentes.length} a corrigir, ` +
      `${planos.filter((p) => p.situacao === "corrigida").length} já corrigidas, ` +
      `${inconsistentes.length} inconsistentes · ${renames.length} arquivos a renomear`,
  )

  if (!commit) {
    console.log("\n  Dry-run: nada foi escrito. Rode com --commit para aplicar.\n")
    return
  }

  // ── COMMIT ────────────────────────────────────────────────────────────────────
  if (renames.length > 0 && resolve(WORK_ROOT) === resolve(RECIBOS_ROOT_DEFAULT)) {
    throw new Error(
      "RECIBOS_ROOT aponta para a raiz legada do OneDrive — os originais são intocáveis. " +
        "Aponte para a cópia de trabalho (tmp/).",
    )
  }

  const resultado = await aplicarCorrecaoBackfill(
    billRepo,
    paymentRepo,
    attachmentRepo,
    HOUSEHOLD,
    planos,
  )
  console.log(
    `\n  Aplicado: ${resultado.contasAplicadas} Contas · payments ${resultado.paymentsAtualizados} · ` +
      `anexos ${resultado.anexosRenomeados} · bills ${resultado.billsAtualizadas} · ` +
      `encerradas ${resultado.encerradas} · inconsistentes puladas ${resultado.contasInconsistentes}`,
  )

  let renomeados = 0
  for (const r of renames) {
    const de = join(WORK_ROOT, r.de)
    if (!existsSync(de)) {
      console.warn(`  ⚠ arquivo não achado para rename: ${r.de}`)
      continue
    }
    const para = join(WORK_ROOT, r.para)
    mkdirSync(dirname(para), { recursive: true })
    renameSync(de, para)
    renomeados += 1
  }
  if (renames.length > 0 || !raizCorrigida) {
    escreverJson(join(WORK_ROOT, MARCADOR_RAIZ), {
      aplicadoEm: new Date().toISOString(),
      shifts: Object.fromEntries(
        adjudicacao.filter((a) => a.shift !== 0).map((a) => [a.label, a.shift]),
      ),
    })
  }
  console.log(`  Arquivos renomeados: ${renomeados} (marcador ${MARCADOR_RAIZ} gravado)`)

  if (!backfillCorrigido) {
    const renamePorDe = new Map(renames.map((r) => [r.de, r.para]))
    const labelsShiftadas = new Map(
      adjudicacao.filter((a) => a.shift !== 0).map((a) => [a.label, a.shift]),
    )
    const controleNovo = controle.map((l) => {
      const shift = labelsShiftadas.get(chaveCategoria(l.cat))
      if (!shift) return l
      const novo: LinhaControleRaw = { ...l, comp: shiftCampo(l.comp, shift) }
      if (typeof novo.compIso === "string") novo.compIso = shiftCampo(novo.compIso, shift)
      return novo
    })
    escreverJson(join(dataDir, "controle.json"), controleNovo)
    for (const [arq, lista] of recibosPorJson) {
      const nova = lista.map((r) => ({ ...r, arquivo: renamePorDe.get(r.arquivo) ?? r.arquivo }))
      escreverJson(join(dataDir, "recibos", arq), nova)
    }
    escreverJson(join(dataDir, MARCADOR_BACKFILL), {
      aplicadoEm: new Date().toISOString(),
      shifts: Object.fromEntries(labelsShiftadas),
    })
    console.log(`  .backfill/ regenerado na competência-verdade (marcador ${MARCADOR_BACKFILL})`)
  }

  // ── Verificação pós-commit: contagens + replano vazio contra as camadas
  // recém-corrigidas (re-lidas do disco — nada de verdade tautológica) ───────────
  const controleV2 = lerJson<LinhaControleRaw[]>(join(dataDir, "controle.json"))
  const planilhaV2 = new Map<string, LinhaPlanilha[]>()
  for (const l of controleV2) {
    const chave = chaveCategoria(l.cat)
    const lista = planilhaV2.get(chave) ?? []
    lista.push({ competencia: l.comp, valorCentavos: l.valorCents, status: l.status })
    planilhaV2.set(chave, lista)
  }
  const compsV2PorSlug = new Map<string, string[]>()
  for (const lista of lerRecibosPorArquivoJson().values()) {
    for (const r of lista) {
      const nome = lerNomeRecibo(r.arquivo)
      if (!nome) continue
      const comps = compsV2PorSlug.get(nome.contaSlug) ?? []
      comps.push(nome.competencia)
      compsV2PorSlug.set(nome.contaSlug, comps)
    }
  }

  // Conta inconsistente foi pulada por decisão — não reprova a verificação; ela
  // fica no aviso final para nova adjudicação.
  const idsInconsistentes = new Set(inconsistentes.map((p) => p.billId))
  let paymentsDepois = 0
  let sobrou = 0
  for (const c of CATALOGO) {
    const adj = adjPorLabel.get(c.label)
    const bill = billPorNome.get(c.nome)
    if (!adj || !bill) continue
    const payments = await paymentRepo.listarPayments(HOUSEHOLD, bill.id)
    paymentsDepois += payments.length
    if (idsInconsistentes.has(bill.id)) continue
    const attachments = await attachmentRepo.listarAttachmentsPorPayments(
      HOUSEHOLD,
      payments.map((p) => p.id),
    )
    const billDepois = (await billRepo.obterBill(HOUSEHOLD, bill.id)) ?? bill

    const verdadeV2 = new Set<string>()
    for (const l of planilhaV2.get(c.label) ?? [])
      if (l.status === "Pago") verdadeV2.add(l.competencia)
    for (const comp of c.dirSlug ? (compsV2PorSlug.get(c.dirSlug) ?? []) : []) verdadeV2.add(comp)

    const replano = planejarCorrecaoConta(
      {
        billId: bill.id,
        // Camadas corrigidas: a verdade já está na competência real, shift residual 0.
        shift: 0,
        dueMonthOffsetAlvo: adj.dueMonthOffsetAlvo,
        dueRuleDayAlvo: adj.dueRuleDayAlvo,
        encerrarEm: adj.encerrarEm,
      },
      {
        bill: {
          id: billDepois.id,
          dueMonthOffset: billDepois.dueMonthOffset,
          dueRuleDay: billDepois.dueRule.kind === "dia-fixo" ? billDepois.dueRule.day : null,
          primeiraCompetencia: billDepois.primeiraCompetencia,
          estado: billDepois.estado,
        },
        payments: payments.map((p) => ({ id: p.id, competencia: p.competencia })),
        attachments: attachments.map((a) => ({
          id: a.id,
          paymentId: a.paymentId,
          nomeOriginal: a.nomeOriginal,
        })),
      },
      [...verdadeV2].sort(),
    )
    if (replano.situacao !== "corrigida") {
      sobrou += 1
      console.error(`  ✗ ${c.nome}: replano ${replano.situacao} após o commit`)
    }
  }

  console.log(
    `\n  Verificação: payments antes ${paymentsAntes} → depois ${paymentsDepois} ` +
      `(${paymentsAntes === paymentsDepois ? "OK, nenhum criado/perdido" : "DIVERGIU!"})`,
  )
  if (paymentsAntes !== paymentsDepois || sobrou > 0) {
    process.exitCode = 1
    console.error("  ✗ Verificação falhou — NÃO prossiga; restaure o pg_dump e investigue.\n")
    return
  }
  if (inconsistentes.length > 0) {
    console.warn(
      `  ⚠ ${inconsistentes.length} Conta(s) inconsistentes ficaram intocadas — adjudique e re-rode.`,
    )
  }
  console.log("  ✓ Correção aplicada e verificada. Re-rodar é no-op (idempotente).\n")
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
