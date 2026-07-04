import { describe, expect, it } from "vitest"
import type { Bill, DadosBill } from "../domain/bill"
import type { BillRepo, DependentesBill, NovaBill } from "../ports/bill-repo"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { BillInvalidaError } from "./create-bill"
import { deleteBill, resumoDeExclusao } from "./delete-bill"
import { BillNaoEncontradaError, editBill } from "./edit-bill"
import { EncerramentoInvalidoError, encerrarBill } from "./encerrar-bill"
import { quickEditBill } from "./quick-edit-bill"

/**
 * Seam 1: o ciclo de vida da Conta (editar · encerrar · deletar) contra um fake
 * do port — sem banco. O fake é um store de verdade (guarda e muta), para os
 * use-cases terem algo sobre o que agir. A contagem de dependentes é injetável
 * no fake, provando que o use-case só repassa o que o port informa.
 */
function fakeBillRepo(opts: { dependentes?: DependentesBill } = {}): BillRepo & { bills: Bill[] } {
  const bills: Bill[] = []
  const dependentes = opts.dependentes ?? { lancamentos: 0, anexos: 0 }
  function achar(householdId: string, billId: string): Bill | undefined {
    return bills.find((b) => b.householdId === householdId && b.id === billId)
  }
  return {
    bills,
    async criarBill(nova: NovaBill) {
      const bill: Bill = {
        id: `bill-${bills.length + 1}`,
        estado: "ativa",
        encerradaEm: null,
        logoKey: null,
        ...nova,
      }
      bills.push(bill)
      return bill
    },
    async listarBills(householdId) {
      return bills.filter((b) => b.householdId === householdId)
    },
    async obterBill(householdId, billId) {
      return achar(householdId, billId) ?? null
    },
    async editarBill(householdId, billId, dados: DadosBill) {
      const bill = achar(householdId, billId)
      if (!bill) return null
      Object.assign(bill, dados)
      return bill
    },
    async encerrarBill(householdId, billId, encerradaEm) {
      const bill = achar(householdId, billId)
      // Só encerra quem está ativa: re-encerrar não acha alvo (espelha o WHERE
      // estado='ativa' do adapter), preservando a data original (#4).
      if (bill?.estado !== "ativa") return null
      bill.estado = "encerrada"
      bill.encerradaEm = encerradaEm
      return bill
    },
    async contarDependentes(householdId, billId) {
      return achar(householdId, billId) ? dependentes : { lancamentos: 0, anexos: 0 }
    },
    async deletarBill(householdId, billId) {
      const i = bills.findIndex((b) => b.householdId === householdId && b.id === billId)
      if (i < 0) return null
      bills.splice(i, 1)
      return dependentes
    },
    async definirLogo(householdId, billId, logoKey) {
      const bill = achar(householdId, billId)
      if (!bill) return null
      bill.logoKey = logoKey
      return bill
    },
  }
}

const DADOS: DadosBill = {
  nome: "Internet",
  descricao: null,
  icon: "wifi",
  recurrence: { intervalMonths: 1, anchorMonth: null },
  dueRule: { kind: "dia-fixo", day: 15 },
  dueMonthOffset: 0,
}

/** Semeia uma Conta ativa no Lar `h-1` e devolve repo + a Conta. */
async function comUmaConta(opts?: { dependentes?: DependentesBill }) {
  const repo = fakeBillRepo(opts)
  const bill = await repo.criarBill({ householdId: "h-1", ...DADOS })
  return { repo, bill }
}

/** `BillBruto` válido para a edição — a borda manda strings/números crus. */
function brutoValido(over: Record<string, unknown> = {}) {
  return {
    nome: "Internet Fibra",
    descricao: "300 mega",
    icon: "wifi",
    intervalMonths: 1,
    anchorMonth: null,
    dueRuleKind: "dia-fixo",
    dueRuleDay: 20,
    dueRuleNth: null,
    dueMonthOffset: 0,
    ...over,
  }
}

describe("editBill (Seam 1)", () => {
  it("test_edicao_valida_persiste_a_nova_regra", async () => {
    const { repo, bill } = await comUmaConta()

    const editada = await editBill(repo, "h-1", bill.id, brutoValido())

    expect(editada.nome).toBe("Internet Fibra")
    expect(editada.descricao).toBe("300 mega")
    expect(editada.dueRule).toEqual({ kind: "dia-fixo", day: 20 })
    // mesma Conta (id e dono preservados), nunca uma nova
    expect(editada.id).toBe(bill.id)
    expect(editada.householdId).toBe("h-1")
    expect(repo.bills).toHaveLength(1)
  })

  it("test_edicao_invalida_lanca_e_nao_persiste", async () => {
    const { repo, bill } = await comUmaConta()

    await expect(editBill(repo, "h-1", bill.id, brutoValido({ nome: "" }))).rejects.toBeInstanceOf(
      BillInvalidaError,
    )
    // a Conta segue com o nome original
    expect(repo.bills[0]?.nome).toBe("Internet")
  })

  it("test_editar_conta_inexistente_lanca_nao_encontrada", async () => {
    const { repo } = await comUmaConta()
    await expect(editBill(repo, "h-1", "sumida", brutoValido())).rejects.toBeInstanceOf(
      BillNaoEncontradaError,
    )
  })

  it("test_editar_conta_de_outro_lar_lanca_nao_encontrada", async () => {
    // escopo por Lar: a Conta existe, mas não para h-2 (acesso é do Lar dono, #1)
    const { repo, bill } = await comUmaConta()
    await expect(editBill(repo, "h-2", bill.id, brutoValido())).rejects.toBeInstanceOf(
      BillNaoEncontradaError,
    )
  })
})

describe("encerrarBill (Seam 1)", () => {
  it("test_encerrar_grava_estado_e_data", async () => {
    const { repo, bill } = await comUmaConta()

    const encerrada = await encerrarBill(repo, "h-1", bill.id, "2026-06-29")

    expect(encerrada.estado).toBe("encerrada")
    expect(encerrada.encerradaEm).toBe("2026-06-29")
  })

  it("test_data_invalida_lanca_e_nao_encerra", async () => {
    const { repo, bill } = await comUmaConta()

    await expect(encerrarBill(repo, "h-1", bill.id, "30/06/2026")).rejects.toBeInstanceOf(
      EncerramentoInvalidoError,
    )
    expect(repo.bills[0]?.estado).toBe("ativa")
  })

  it("test_encerrar_conta_inexistente_lanca_nao_encontrada", async () => {
    const { repo } = await comUmaConta()
    await expect(encerrarBill(repo, "h-1", "sumida", "2026-06-29")).rejects.toBeInstanceOf(
      BillNaoEncontradaError,
    )
  })

  it("test_reencerrar_nao_reescreve_a_data_original", async () => {
    // corrida de acesso simétrico / form obsoleto: o 2º encerrar não pode
    // sobrescrever a data já gravada (fato passado — invariante #4)
    const { repo, bill } = await comUmaConta()
    await encerrarBill(repo, "h-1", bill.id, "2026-06-29")

    await expect(encerrarBill(repo, "h-1", bill.id, "2026-12-31")).rejects.toBeInstanceOf(
      BillNaoEncontradaError,
    )
    expect(repo.bills[0]?.encerradaEm).toBe("2026-06-29")
  })
})

describe("deleteBill + resumoDeExclusao (Seam 1)", () => {
  it("test_resumo_informa_a_contagem_de_dependentes", async () => {
    const { repo, bill } = await comUmaConta({ dependentes: { lancamentos: 3, anexos: 5 } })

    const resumo = await resumoDeExclusao(repo, "h-1", bill.id)

    expect(resumo).toEqual({ lancamentos: 3, anexos: 5 })
  })

  it("test_delete_remove_a_conta_e_devolve_a_contagem", async () => {
    const { repo, bill } = await comUmaConta({ dependentes: { lancamentos: 2, anexos: 1 } })
    const store = fakeAttachmentStore()

    const removidos = await deleteBill(repo, store, "h-1", bill.id)

    expect(removidos).toEqual({ lancamentos: 2, anexos: 1 })
    expect(repo.bills).toHaveLength(0)
  })

  it("test_deletar_conta_inexistente_lanca_e_nao_remove_nada", async () => {
    const { repo } = await comUmaConta()
    const store = fakeAttachmentStore()
    await expect(deleteBill(repo, store, "h-1", "sumida")).rejects.toBeInstanceOf(
      BillNaoEncontradaError,
    )
    expect(repo.bills).toHaveLength(1)
  })

  it("test_deletar_conta_com_logo_apaga_o_objeto_no_r2", async () => {
    const { repo, bill } = await comUmaConta()
    const chave = `finance/bills/h-1/${bill.id}/up-1`
    await repo.definirLogo("h-1", bill.id, chave)
    const store = fakeAttachmentStore([{ chave, tamanhoBytes: 20_000, tipoMime: "image/png" }])

    await deleteBill(repo, store, "h-1", bill.id)

    expect(store.chaves()).toHaveLength(0)
  })

  it("test_deletar_conta_sem_logo_nao_toca_o_bucket", async () => {
    const { repo, bill } = await comUmaConta()
    const store = fakeAttachmentStore([
      { chave: "finance/bills/h-1/outra-conta/up-1", tamanhoBytes: 1, tipoMime: "image/png" },
    ])

    await deleteBill(repo, store, "h-1", bill.id)

    expect(store.chaves()).toEqual(["finance/bills/h-1/outra-conta/up-1"])
  })
})

/** Uma Conta com regra avançada: âncora anual, n-ésimo dia útil e deslocamento de mês. */
const DADOS_AVANCADA: DadosBill = {
  nome: "Condomínio",
  descricao: "bloco B",
  icon: "building-2",
  recurrence: { intervalMonths: 12, anchorMonth: 1 },
  dueRule: { kind: "n-esimo-dia-util", nth: 5 },
  dueMonthOffset: 1,
}

/** Semeia uma Conta com regra avançada no Lar `h-1` e devolve repo + a Conta. */
async function comContaAvancada() {
  const repo = fakeBillRepo()
  const bill = await repo.criarBill({ householdId: "h-1", ...DADOS_AVANCADA })
  return { repo, bill }
}

describe("quickEditBill (Seam 1)", () => {
  it("test_edicao_rapida_altera_nome_icone_e_vencimento", async () => {
    const { repo, bill } = await comUmaConta()

    const editada = await quickEditBill(repo, "h-1", bill.id, {
      nome: "Net Fibra",
      icon: "tv",
      dueRule: { kind: "dia-fixo", day: 5 },
    })

    expect(editada.nome).toBe("Net Fibra")
    expect(editada.icon).toBe("tv")
    expect(editada.dueRule).toEqual({ kind: "dia-fixo", day: 5 })
    // mesma Conta, nunca uma nova
    expect(editada.id).toBe(bill.id)
    expect(repo.bills).toHaveLength(1)
  })

  it("test_edicao_rapida_preserva_campos_avancados", async () => {
    const { repo, bill } = await comContaAvancada()

    // edição rápida sem tocar o vencimento: a regra avançada segue intacta
    const editada = await quickEditBill(repo, "h-1", bill.id, {
      nome: "Condomínio Torre B",
      icon: "home",
    })

    expect(editada.nome).toBe("Condomínio Torre B")
    expect(editada.icon).toBe("home")
    // byte a byte: descrição, frequência, âncora, n-ésimo dia útil e deslocamento
    expect(editada.descricao).toBe("bloco B")
    expect(editada.recurrence).toEqual({ intervalMonths: 12, anchorMonth: 1 })
    expect(editada.dueRule).toEqual({ kind: "n-esimo-dia-util", nth: 5 })
    expect(editada.dueMonthOffset).toBe(1)
  })

  it("test_ultimo_dia_util_troca_a_regra_sem_perder_o_avancado", async () => {
    const { repo, bill } = await comContaAvancada()

    const editada = await quickEditBill(repo, "h-1", bill.id, {
      nome: "Condomínio",
      icon: "building-2",
      dueRule: { kind: "ultimo-dia-util" },
    })

    expect(editada.dueRule).toEqual({ kind: "ultimo-dia-util" })
    // o deslocamento e a periodicidade avançados sobrevivem à troca do vencimento
    expect(editada.dueMonthOffset).toBe(1)
    expect(editada.recurrence).toEqual({ intervalMonths: 12, anchorMonth: 1 })
  })

  it("test_nome_vazio_lanca_e_nao_persiste", async () => {
    const { repo } = await comUmaConta()

    await expect(
      quickEditBill(repo, "h-1", repo.bills[0]?.id ?? "", { nome: "  ", icon: "wifi" }),
    ).rejects.toBeInstanceOf(BillInvalidaError)
    // a Conta segue com o nome original
    expect(repo.bills[0]?.nome).toBe("Internet")
  })

  it("test_edicao_rapida_conta_inexistente_lanca_nao_encontrada", async () => {
    const { repo } = await comUmaConta()
    await expect(
      quickEditBill(repo, "h-1", "sumida", { nome: "x", icon: "wifi" }),
    ).rejects.toBeInstanceOf(BillNaoEncontradaError)
  })

  it("test_edicao_rapida_conta_de_outro_lar_lanca_nao_encontrada", async () => {
    // escopo por Lar: a Conta existe, mas não para h-2 (acesso é do Lar dono, #1)
    const { repo, bill } = await comUmaConta()
    await expect(
      quickEditBill(repo, "h-2", bill.id, { nome: "x", icon: "wifi" }),
    ).rejects.toBeInstanceOf(BillNaoEncontradaError)
  })
})
