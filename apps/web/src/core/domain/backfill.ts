/**
 * Backfill histórico de Finanças — núcleo puro (ADR-0003). A ferramenta de
 * ingestão (issue #24) tem duas metades: um **passe de visão** lê os comprovantes
 * e extrai data/valor (a borda, com IO e modelo), e este módulo faz o **cross-check
 * determinístico** que casa o que a planilha de controle afirma com o que os
 * comprovantes mostram, emitindo um **manifesto** conferível. Nada de IO aqui: a
 * borda traz `ReciboExtraido[]` por Conta; isto decide o que importar, o que vira
 * "pago sem data" e o que cai pra revisão manual — sem inserção silenciosa.
 *
 * A planilha é a verdade do **valor** (o livro-caixa do operador); o comprovante é
 * a verdade da **data** (quando se pagou de fato) e a prova anexável. Divergência
 * de valor entre os dois nunca entra calada — vira `revisar`.
 */

import type { BillBruto } from "./bill"

/** O que o nome de um comprovante revela: a Conta (pasta) e a competência. */
export type NomeRecibo = { contaSlug: string; competencia: string }

const SUFIXO_COMPETENCIA_RE = /(\d{4})(\d{2})\.[^.]+$/

/** Soma `n` meses a uma competência `YYYY-MM` (aceita `n` negativo), virando o ano quando preciso. */
export function somarMeses(competencia: string, n: number): string {
  const [ano, mes] = competencia.split("-").map(Number)
  const total = ano * 12 + (mes - 1) + n
  const novoAno = Math.floor(total / 12)
  const novoMes = (total % 12) + 1
  return `${novoAno}-${String(novoMes).padStart(2, "0")}`
}

/**
 * Lê o nome de um comprovante organizado como `<conta>/<ano>/<...>-YYYYMM.ext` e
 * devolve o slug da Conta (a **pasta**, não o prefixo do arquivo — `luz` guarda
 * `conta-luz-YYYYMM`) e a competência `YYYY-MM`. `null` quando não há `YYYYMM`
 * legível no fim do nome ou o mês está fora de 01–12. Pura — a borda passa o
 * caminho relativo à raiz dos comprovantes.
 */
export function lerNomeRecibo(caminhoRelativo: string): NomeRecibo | null {
  const m = SUFIXO_COMPETENCIA_RE.exec(caminhoRelativo)
  if (!m) return null
  const [, ano, mes] = m
  if (Number(mes) < 1 || Number(mes) > 12) return null
  const contaSlug = caminhoRelativo.split("/")[0]
  if (!contaSlug) return null
  return { contaSlug, competencia: `${ano}-${mes}` }
}

/**
 * Lê o nome de um comprovante traduzindo a **defasagem legada de nomenclatura**:
 * nas raízes antigas (OneDrive), algumas Contas gravaram no nome o mês anterior ao
 * da Competência real (Competência = mês do vencimento — decisão de 04/07/2026), e
 * esses originais ficam intocados para sempre. `offsetNomeLegado` é o deslocamento
 * da Conta (nome + offset = competência real). A guarda anti-double-shift:
 * `raizCorrigida = true` (raiz já renomeada para a verdade) lê o nome como está —
 * traduzir de novo deslocaria duas vezes.
 */
export function competenciaDoRecibo(
  caminhoRelativo: string,
  offsetNomeLegado: number,
  raizCorrigida: boolean,
): NomeRecibo | null {
  const nome = lerNomeRecibo(caminhoRelativo)
  if (!nome) return null
  if (raizCorrigida || offsetNomeLegado === 0) return nome
  return { ...nome, competencia: somarMeses(nome.competencia, offsetNomeLegado) }
}

/** O que o catálogo da borda informa sobre uma Conta para o cadastro do backfill. */
export type ContaBackfill = {
  nome: string
  icon: string
  dueDay: number
  dueMonthOffset: number
}

/**
 * Monta o `BillBruto` do cadastro de uma Conta do backfill — **com** a
 * `primeiraCompetencia`, obrigatória desde a migração 0008 (sem ela,
 * `createBill` recusa o cadastro; o caminho idempotente de Conta já existente
 * mascarava a omissão).
 */
export function billBrutoDeConta(conta: ContaBackfill, primeiraCompetencia: string): BillBruto {
  return {
    nome: conta.nome,
    descricao: null,
    icon: conta.icon,
    intervalMonths: 1,
    anchorMonth: null,
    dueRuleKind: "dia-fixo",
    dueRuleDay: conta.dueDay,
    dueMonthOffset: conta.dueMonthOffset,
    primeiraCompetencia,
  }
}

/**
 * Deriva a primeira Competência de uma Conta nova a partir da planilha: a menor
 * linha **paga** (mesma regra do backfill da migração 0008). Sem linha paga, cai
 * no mês corrente — a Conta nasce sem vigência retroativa.
 */
export function primeiraCompetenciaDe(planilha: LinhaPlanilha[], mesCorrente: string): string {
  const pagas = planilha.filter((l) => l.status === "Pago").map((l) => l.competencia)
  if (pagas.length === 0) return mesCorrente
  return pagas.reduce((menor, c) => (c < menor ? c : menor))
}

/** Uma linha da planilha de controle para uma Conta: a competência e o valor esperados. */
export type LinhaPlanilha = {
  /** Competência `ano-mês` (YYYY-MM) a que o pagamento se refere. */
  competencia: string
  /** Valor esperado, inteiro em centavos, BRL (invariante #6). */
  valorCentavos: number
  /** Estado na planilha — só `"Pago"` vira Lançamento; `"Pendente"` é ignorado. */
  status: string
}

/** Um comprovante já lido pelo passe de visão, antes do cross-check. */
export type ReciboExtraido = {
  /** Caminho de origem do arquivo (rótulo conferível no manifesto). */
  arquivo: string
  /** Competência inferida do nome do arquivo (`<conta>-YYYYMM`), normalizada a YYYY-MM. */
  competencia: string
  /** Data de pagamento extraída do comprovante (YYYY-MM-DD); `null` se ilegível. */
  dataPagamento: string | null
  /** Valor lido do comprovante em centavos; `null` se ilegível. */
  valorRecibo: number | null
  /** Tipo MIME do arquivo (`image/jpeg`, `application/pdf`…), para o upload. */
  tipoMime: string
  /**
   * Vencimento estampado no documento (YYYY-MM-DD), quando legível — recibos v2
   * (#124). É a evidência documental que decide offset de defasagem e dueDay real.
   */
  vencimentoImpresso?: string | null
  /** Mês/período de referência estampado (YYYY-MM), quando o documento o traz — recibos v2. */
  mesReferenciaImpresso?: string | null
}

/** As entradas de uma Conta para o cross-check: planilha + recibos + a quem atribuir. */
export type EntradaConta = {
  /** A Conta (Bill) já cadastrada a que tudo isto pertence. */
  billId: string
  /** A Pessoa a quem atribuir a autoria dos Lançamentos (autoria, não permissão — #1). */
  paidBy: string
  /** Linhas da planilha de controle desta Conta. */
  planilha: LinhaPlanilha[]
  /** Recibos extraídos pelo passe de visão desta Conta. */
  recibos: ReciboExtraido[]
}

/** Os achados do cross-check de uma linha — o "porquê" do estado, conferível no manifesto. */
export type FlagManifesto =
  | "ok" // recibo legível, valor confere, data presente
  | "sem-recibo" // planilha diz pago, mas nenhum comprovante achado → sem data
  | "data-ilegivel" // comprovante achado, mas sem data legível → sem data
  | "valor-divergente" // valor do comprovante ≠ valor da planilha → revisão
  | "sem-planilha" // comprovante órfão, sem linha "Pago" na planilha → revisão

/** A referência ao comprovante a anexar (caminho + tipo), quando há um. */
export type ReciboManifesto = { arquivo: string; tipoMime: string }

/** Uma linha do manifesto: o que o import determinístico vai (ou não) inserir. */
export type LinhaManifesto = {
  billId: string
  competencia: string
  /** Data de pagamento a persistir; `null` é o estado "pago sem data". */
  dataPagamento: string | null
  /** Valor a persistir, centavos — a verdade da planilha. */
  valor: number
  /** Valor lido do comprovante (centavos); `null` sem recibo ou ilegível. Insumo da adjudicação. */
  valorRecibo: number | null
  paidBy: string
  /** O comprovante a subir/anexar, se houver. */
  recibo: ReciboManifesto | null
  /** Os achados do cross-check (sempre ao menos um). */
  flags: FlagManifesto[]
  /** Divergência que pede olho humano — o import **não** insere linhas com `revisar`. */
  revisar: boolean
}

/**
 * Casa a planilha de uma Conta com seus comprovantes e emite o manifesto. Para
 * cada linha **paga** da planilha procura o recibo de mesma competência: havendo,
 * usa a data dele e confere o valor (divergência → `revisar`); faltando, marca
 * "pago sem data" sem pedir revisão (estado conhecido, não erro). Comprovante sem
 * linha paga correspondente é órfão — entra como `revisar` (sem valor confiável,
 * não se insere às cegas). Linhas `Pendente` não viram Lançamento.
 */
export function construirManifesto(entrada: EntradaConta): LinhaManifesto[] {
  const { billId, paidBy } = entrada
  const recibosPorComp = new Map<string, ReciboExtraido>()
  for (const r of entrada.recibos) {
    if (!recibosPorComp.has(r.competencia)) recibosPorComp.set(r.competencia, r)
  }

  const linhas: LinhaManifesto[] = []
  const compConsumidas = new Set<string>()

  for (const linha of entrada.planilha) {
    if (linha.status !== "Pago") continue
    const recibo = recibosPorComp.get(linha.competencia)
    const flags: FlagManifesto[] = []
    let dataPagamento: string | null = null
    let reciboRef: ReciboManifesto | null = null

    if (recibo) {
      compConsumidas.add(linha.competencia)
      reciboRef = { arquivo: recibo.arquivo, tipoMime: recibo.tipoMime }
      if (recibo.dataPagamento) dataPagamento = recibo.dataPagamento
      else flags.push("data-ilegivel")
      if (recibo.valorRecibo !== null && recibo.valorRecibo !== linha.valorCentavos)
        flags.push("valor-divergente")
    } else {
      flags.push("sem-recibo")
    }

    const revisar = flags.includes("valor-divergente")
    linhas.push({
      billId,
      competencia: linha.competencia,
      dataPagamento,
      valor: linha.valorCentavos,
      valorRecibo: recibo ? recibo.valorRecibo : null,
      paidBy,
      recibo: reciboRef,
      flags: flags.length > 0 ? flags : ["ok"],
      revisar,
    })
  }

  // Comprovantes órfãos: existem no disco mas a planilha não os reconhece como pagos.
  for (const r of entrada.recibos) {
    if (compConsumidas.has(r.competencia)) continue
    if (entrada.planilha.some((l) => l.competencia === r.competencia && l.status === "Pago"))
      continue
    linhas.push({
      billId,
      competencia: r.competencia,
      dataPagamento: r.dataPagamento,
      valor: r.valorRecibo ?? 0,
      valorRecibo: r.valorRecibo,
      paidBy,
      recibo: { arquivo: r.arquivo, tipoMime: r.tipoMime },
      flags: ["sem-planilha"],
      revisar: true,
    })
    compConsumidas.add(r.competencia)
  }

  return linhas
}
