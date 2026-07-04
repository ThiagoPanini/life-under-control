import { describe, expect, it } from "vitest"
import type { Bill, BillBruto } from "../domain/bill"
import type { BillRepo, NovaBill } from "../ports/bill-repo"
import { BillInvalidaError, createBill } from "./create-bill"
import { listBills } from "./list-bills"

/** Seam 1: os use-cases de Conta contra um fake do port — sem banco. */
function fakeBillRepo(): BillRepo & { gravadas: NovaBill[] } {
  const gravadas: NovaBill[] = []
  return {
    gravadas,
    async criarBill(nova) {
      gravadas.push(nova)
      const bill: Bill = {
        id: `bill-${gravadas.length}`,
        estado: "ativa",
        encerradaEm: null,
        logoKey: null,
        ...nova,
      }
      return bill
    },
    async listarBills(householdId) {
      return gravadas
        .filter((b) => b.householdId === householdId)
        .map((nova, i) => ({
          id: `bill-${i + 1}`,
          estado: "ativa" as const,
          encerradaEm: null,
          logoKey: null,
          ...nova,
        }))
    },
    // Ciclo de vida não exercitado aqui — coberto em bill-lifecycle.test.ts.
    obterBill: () => Promise.reject(new Error("não usado")),
    editarBill: () => Promise.reject(new Error("não usado")),
    encerrarBill: () => Promise.reject(new Error("não usado")),
    reativarBill: () => Promise.reject(new Error("não usado")),
    contarDependentes: () => Promise.reject(new Error("não usado")),
    deletarBill: () => Promise.reject(new Error("não usado")),
    definirLogo: () => Promise.reject(new Error("não usado")),
  }
}

function brutoValido(over: Partial<BillBruto> = {}): BillBruto {
  return {
    nome: "Internet",
    descricao: null,
    icon: "wifi",
    intervalMonths: 1,
    anchorMonth: null,
    dueRuleKind: "dia-fixo",
    dueRuleDay: 15,
    dueRuleNth: null,
    dueMonthOffset: 0,
    primeiraCompetencia: "2026-06",
    ...over,
  }
}

describe("createBill (Seam 1)", () => {
  it("test_cadastro_valido_persiste_com_household_e_estado_ativa", async () => {
    const repo = fakeBillRepo()

    const bill = await createBill(repo, "h-1", brutoValido())

    expect(bill.id).toBeTruthy()
    expect(bill.householdId).toBe("h-1")
    expect(bill.estado).toBe("ativa")
    expect(bill.dueRule).toEqual({ kind: "dia-fixo", day: 15 })
    expect(repo.gravadas).toHaveLength(1)
  })

  it("test_household_vem_da_borda_nao_do_formulario", async () => {
    // O householdId é argumento do use-case, nunca campo do bruto — a borda
    // injeta o Lar logado. Confere que é ele que chega ao port.
    const repo = fakeBillRepo()
    await createBill(repo, "h-99", brutoValido())
    expect(repo.gravadas[0]?.householdId).toBe("h-99")
  })

  it("test_cadastro_invalido_lanca_e_nao_persiste", async () => {
    const repo = fakeBillRepo()

    await expect(createBill(repo, "h-1", brutoValido({ nome: "" }))).rejects.toBeInstanceOf(
      BillInvalidaError,
    )
    expect(repo.gravadas).toHaveLength(0)
  })

  it("test_erro_carrega_campos_invalidos", async () => {
    const repo = fakeBillRepo()
    try {
      await createBill(repo, "h-1", brutoValido({ intervalMonths: 2, anchorMonth: null }))
      expect.unreachable("deveria lançar")
    } catch (e) {
      expect(e).toBeInstanceOf(BillInvalidaError)
      expect((e as BillInvalidaError).erros.map((x) => x.campo)).toContain("anchorMonth")
    }
  })
})

describe("listBills (Seam 1)", () => {
  it("test_lista_apenas_contas_do_lar", async () => {
    const repo = fakeBillRepo()
    await createBill(repo, "h-1", brutoValido({ nome: "Luz", icon: "zap" }))
    await createBill(repo, "h-1", brutoValido({ nome: "Água", icon: "droplet" }))
    await createBill(repo, "h-2", brutoValido({ nome: "Gás", icon: "flame" }))

    const doLar = await listBills(repo, "h-1")

    expect(doLar.map((b) => b.nome)).toEqual(["Luz", "Água"])
  })
})
