/**
 * Correção de Competência do backfill (#124) — núcleo puro (ADR-0003). O #24
 * confiou no nome dos arquivos como Competência, e algumas Contas gravaram o nome
 * com o mês defasado em −1 (Competência = mês do vencimento esperado — decisão de
 * 04/07/2026). Este módulo tem as duas metades determinísticas da correção:
 *
 * - **Diagnóstico**: a evidência documental (vencimento impresso extraído pelo
 *   passe de visão — recibos v2) confrontada com o nome de cada arquivo, por
 *   Conta: offset observado, dia de vencimento observado, cobertura e exceções.
 *   É insumo do Gate 1 — quem decide a regra é o operador, não o consenso.
 * - **Plano**: dada a regra adjudicada, o diff exato contra o estado importado
 *   (UPDATEs de competência, regra de vencimento, primeira competência, nomes de
 *   Anexo, encerramento) e os renames de arquivo. O plano nasce **idempotente**:
 *   comparação é sempre contra o conjunto-verdade — estado já corrigido emite
 *   plano vazio; estado irreconhecível emite `inconsistente` e não toca em nada.
 */

import type { FlagManifesto, LinhaManifesto, ReciboExtraido } from "./backfill"
import { lerNomeRecibo, somarMeses } from "./backfill"

/** Um arquivo cuja evidência contradiz a regra observada da própria Conta. */
export type ExcecaoDiagnostico = {
  arquivo: string
  /** Offset deste arquivo (mês do vencimento impresso − mês do nome). */
  offsetDoArquivo: number
  vencimentoImpresso: string
  mesReferenciaImpresso: string | null
}

/** O que a evidência documental diz de uma Conta — insumo do Gate 1, não veredito. */
export type DiagnosticoConta = {
  contaSlug: string
  totalRecibos: number
  /** Cobertura da evidência: quantos recibos têm vencimento impresso legível. */
  comVencimentoImpresso: number
  /** Offset consenso (moda; empate cai no menor valor absoluto); `null` sem evidência. */
  offsetObservado: number | null
  /** Dia de vencimento consenso (moda dos dias impressos); `null` sem evidência. */
  dueDayObservado: number | null
  excecoes: ExcecaoDiagnostico[]
}

/** Meses corridos de uma competência `YYYY-MM` (para diferenças). */
function mesesDe(competencia: string): number {
  const [ano, mes] = competencia.split("-").map(Number)
  return ano * 12 + (mes - 1)
}

/**
 * Soma `shift` meses a um campo `YYYY-MM` ou `YYYY-MM-DD`, preservando o sufixo
 * (o dia, quando houver). Valor fora do formato passa intocado — a regeneração
 * do `.backfill/` não pode corromper campo que não é competência.
 */
export function shiftCampo(valor: string, shift: number): string {
  if (!/^\d{4}-\d{2}/.test(valor)) return valor
  return `${somarMeses(valor.slice(0, 7), shift)}${valor.slice(7)}`
}

/** A moda de uma lista; empate decide por menor valor absoluto, depois menor valor. */
function moda(valores: number[]): number | null {
  if (valores.length === 0) return null
  const contagem = new Map<number, number>()
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1)
  let melhor: number | null = null
  let melhorContagem = 0
  for (const [v, n] of contagem) {
    const ganha =
      n > melhorContagem ||
      (n === melhorContagem &&
        melhor !== null &&
        (Math.abs(v) < Math.abs(melhor) || (Math.abs(v) === Math.abs(melhor) && v < melhor)))
    if (ganha) {
      melhor = v
      melhorContagem = n
    }
  }
  return melhor
}

/**
 * Confronta, para uma Conta, o nome de cada comprovante com o vencimento impresso
 * nele (recibos v2) e emite a regra observada. Recibo sem vencimento legível conta
 * só na cobertura — não vota. Exceção é o arquivo cujo offset individual contraria
 * a moda da própria Conta: vai nominal para o relatório, nunca é "acomodada".
 */
export function diagnosticarConta(contaSlug: string, recibos: ReciboExtraido[]): DiagnosticoConta {
  const comEvidencia = recibos.filter(
    (r): r is ReciboExtraido & { vencimentoImpresso: string } => !!r.vencimentoImpresso,
  )

  const offsets = comEvidencia.map(
    (r) => mesesDe(r.vencimentoImpresso.slice(0, 7)) - mesesDe(r.competencia),
  )
  const offsetObservado = moda(offsets)
  const dueDayObservado = moda(comEvidencia.map((r) => Number(r.vencimentoImpresso.slice(8, 10))))

  const excecoes: ExcecaoDiagnostico[] = []
  for (const r of comEvidencia) {
    const offset = mesesDe(r.vencimentoImpresso.slice(0, 7)) - mesesDe(r.competencia)
    if (offsetObservado !== null && offset !== offsetObservado) {
      excecoes.push({
        arquivo: r.arquivo,
        offsetDoArquivo: offset,
        vencimentoImpresso: r.vencimentoImpresso,
        mesReferenciaImpresso: r.mesReferenciaImpresso ?? null,
      })
    }
  }

  return {
    contaSlug,
    totalRecibos: recibos.length,
    comVencimentoImpresso: comEvidencia.length,
    offsetObservado,
    dueDayObservado,
    excecoes,
  }
}

/** Uma linha que pede decisão do operador no Gate 1, com os dois valores à vista. */
export type LinhaAdjudicacao = {
  billId: string
  competencia: string
  motivo: FlagManifesto
  /** O que a planilha afirma (centavos). */
  valorPlanilha: number
  /** O que o comprovante mostra (centavos); `null` se ilegível ou ausente. */
  valorRecibo: number | null
  arquivo: string | null
}

/** Reduz o manifesto à tabela única de adjudicação: só as linhas `revisar`. */
export function tabelaDeAdjudicacao(linhas: LinhaManifesto[]): LinhaAdjudicacao[] {
  return linhas
    .filter((l) => l.revisar)
    .map((l) => ({
      billId: l.billId,
      competencia: l.competencia,
      motivo: l.flags.includes("sem-planilha") ? ("sem-planilha" as const) : l.flags[0],
      valorPlanilha: l.valor,
      valorRecibo: l.valorRecibo,
      arquivo: l.recibo?.arquivo ?? null,
    }))
}

/** A regra adjudicada pelo operador (Gate 1) para uma Conta. */
export type RegraCorrecaoConta = {
  billId: string
  /** Quantos meses somar às competências dos Lançamentos (0 = conta não defasada). */
  shift: number
  /** `due_month_offset` final (0 — a acomodação do Condomínio deixa de existir). */
  dueMonthOffsetAlvo: number
  /** Dia de vencimento real observado; `null` mantém o atual. */
  dueRuleDayAlvo: number | null
  /** Data civil de encerramento da Conta (DAS Jakeline); `null` não encerra. */
  encerrarEm: string | null
}

/** O recorte do estado importado (prod) que o plano confronta. */
export type EstadoContaCorrecao = {
  bill: {
    id: string
    dueMonthOffset: number
    dueRuleDay: number | null
    primeiraCompetencia: string
    estado: "ativa" | "encerrada"
  }
  payments: { id: string; competencia: string }[]
  attachments: { id: string; paymentId: string; nomeOriginal: string }[]
}

/** O diff exato de uma Conta — o que o `--commit` aplica, nada além. */
export type PlanoCorrecaoConta = {
  billId: string
  /**
   * `corrigida` = nada a fazer; `pendente` = plano abaixo aplica; `inconsistente`
   * = o estado não casa nem com o legado nem com a verdade — não se toca em nada.
   */
  situacao: "corrigida" | "pendente" | "inconsistente"
  paymentUpdates: { paymentId: string; de: string; para: string }[]
  billUpdate: { dueMonthOffset?: number; dueRuleDay?: number; primeiraCompetencia?: string } | null
  attachmentRenames: { attachmentId: string; de: string; para: string }[]
  encerramento: { encerradaEm: string } | null
  avisos: string[]
}

/** `2023-09` → `202309` (o formato compacto dos sufixos de nome de arquivo). */
function compacta(competencia: string): string {
  return competencia.replace("-", "")
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every((x) => sb.has(x))
}

/**
 * Confronta o estado importado de uma Conta com o **conjunto-verdade** de
 * competências (o manifesto regenerado com a Competência real) e emite o diff. A
 * âncora de idempotência é o conjunto: payments já na verdade → nada a shiftar;
 * payments na verdade−shift → shifta tudo; qualquer outra forma → `inconsistente`
 * (relata e não toca — decidir é do operador). Comparar por conjunto, e não linha
 * a linha, é o que impede o double-shift em cadeias de meses consecutivos.
 */
export function planejarCorrecaoConta(
  regra: RegraCorrecaoConta,
  estado: EstadoContaCorrecao,
  competenciasVerdade: string[],
): PlanoCorrecaoConta {
  const avisos: string[] = []
  const comps = estado.payments.map((p) => p.competencia)

  const vazio: PlanoCorrecaoConta = {
    billId: regra.billId,
    situacao: "corrigida",
    paymentUpdates: [],
    billUpdate: null,
    attachmentRenames: [],
    encerramento: null,
    avisos,
  }

  if (new Set(comps).size !== comps.length) {
    avisos.push("competência duplicada entre os Lançamentos da Conta — corrija à mão antes")
    return { ...vazio, situacao: "inconsistente" }
  }

  let paymentUpdates: PlanoCorrecaoConta["paymentUpdates"] = []
  if (mesmoConjunto(comps, competenciasVerdade)) {
    // Já na verdade — nada a shiftar.
  } else if (
    regra.shift !== 0 &&
    mesmoConjunto(
      comps.map((c) => somarMeses(c, regra.shift)),
      competenciasVerdade,
    )
  ) {
    paymentUpdates = estado.payments
      .map((p) => ({
        paymentId: p.id,
        de: p.competencia,
        para: somarMeses(p.competencia, regra.shift),
      }))
      .sort((a, b) => (a.de < b.de ? 1 : -1))
  } else {
    avisos.push(
      `competências dos Lançamentos não casam nem com a verdade nem com a verdade−${regra.shift} — nada será tocado`,
    )
    return { ...vazio, situacao: "inconsistente" }
  }

  // Renome dos Anexos: o nome_original acompanha a competência corrigida do Lançamento.
  const attachmentRenames: PlanoCorrecaoConta["attachmentRenames"] = []
  for (const up of paymentUpdates) {
    for (const anexo of estado.attachments.filter((a) => a.paymentId === up.paymentId)) {
      const sufixoDe = compacta(up.de)
      if (!anexo.nomeOriginal.includes(sufixoDe)) {
        avisos.push(
          `anexo ${anexo.id} (${anexo.nomeOriginal}) não carrega o sufixo ${sufixoDe} — nome mantido`,
        )
        continue
      }
      attachmentRenames.push({
        attachmentId: anexo.id,
        de: anexo.nomeOriginal,
        para: anexo.nomeOriginal.replace(sufixoDe, compacta(up.para)),
      })
    }
  }

  // Campos da Conta: offset alvo, dia real de vencimento e a primeira competência re-derivada
  // (exceção deliberada de saneamento ao "editar preserva" do ADR-0011).
  const compsFinais = paymentUpdates.length > 0 ? paymentUpdates.map((u) => u.para) : comps
  const billUpdate: NonNullable<PlanoCorrecaoConta["billUpdate"]> = {}
  if (estado.bill.dueMonthOffset !== regra.dueMonthOffsetAlvo)
    billUpdate.dueMonthOffset = regra.dueMonthOffsetAlvo
  if (regra.dueRuleDayAlvo !== null && estado.bill.dueRuleDay !== regra.dueRuleDayAlvo)
    billUpdate.dueRuleDay = regra.dueRuleDayAlvo
  if (compsFinais.length > 0) {
    const primeira = compsFinais.reduce((menor, c) => (c < menor ? c : menor))
    if (primeira !== estado.bill.primeiraCompetencia) billUpdate.primeiraCompetencia = primeira
  }

  const encerramento =
    regra.encerrarEm && estado.bill.estado === "ativa" ? { encerradaEm: regra.encerrarEm } : null

  const temMudanca =
    paymentUpdates.length > 0 ||
    attachmentRenames.length > 0 ||
    Object.keys(billUpdate).length > 0 ||
    encerramento !== null

  return {
    billId: regra.billId,
    situacao: temMudanca ? "pendente" : "corrigida",
    paymentUpdates,
    billUpdate: Object.keys(billUpdate).length > 0 ? billUpdate : null,
    attachmentRenames,
    encerramento,
    avisos,
  }
}

/**
 * Planeja os renames dos comprovantes de uma raiz **legada** para a
 * competência-verdade: sufixo `YYYYMM` somado ao offset e diretório do ano
 * acompanhando a virada. Raiz corrigida (ou offset 0) não renomeia nada — é a
 * mesma guarda anti-double-shift de `competenciaDoRecibo`. Os originais do
 * OneDrive nunca passam por aqui: isto opera só na cópia de trabalho (`tmp/`).
 */
export function planejarRenamesArquivos(
  arquivos: string[],
  offsetNomeLegado: number,
  raizCorrigida: boolean,
): { de: string; para: string }[] {
  if (raizCorrigida || offsetNomeLegado === 0) return []

  const renames: { de: string; para: string; competencia: string }[] = []
  for (const arquivo of arquivos) {
    const nome = lerNomeRecibo(arquivo)
    if (!nome) continue
    const nova = somarMeses(nome.competencia, offsetNomeLegado)
    let para = arquivo.replace(`${compacta(nome.competencia)}.`, `${compacta(nova)}.`)
    const partes = para.split("/")
    if (partes.length === 3 && /^\d{4}$/.test(partes[1])) {
      partes[1] = nova.slice(0, 4)
      para = partes.join("/")
    }
    if (para !== arquivo) renames.push({ de: arquivo, para, competencia: nome.competencia })
  }

  // Ordem de aplicação segura para meses consecutivos: shift positivo renomeia do
  // mês mais recente para o mais antigo (o destino de cada rename já foi desocupado
  // pelo anterior); shift negativo, o inverso — mesma razão do sort decrescente dos
  // paymentUpdates. Sem isso, `202301→202302` sobrescreveria o comprovante real.
  renames.sort((a, b) =>
    offsetNomeLegado > 0
      ? b.competencia.localeCompare(a.competencia)
      : a.competencia.localeCompare(b.competencia),
  )
  return renames.map(({ de, para }) => ({ de, para }))
}
