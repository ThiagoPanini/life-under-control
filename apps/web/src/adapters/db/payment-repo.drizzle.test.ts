import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { NovaBill } from "@/core/ports/bill-repo"
import type { NovoPayment } from "@/core/ports/payment-repo"
import { runMigrations } from "../../../migrate.mjs"
import { drizzleBillRepo } from "./bill-repo.drizzle"
import { drizzlePaymentRepo } from "./payment-repo.drizzle"
import * as schema from "./schema"
import { households, users } from "./schema"

/**
 * Seam 2: o adapter Drizzle de `payments` contra um Postgres real. Confere o
 * round-trip da forma de domínio (valor em centavos, data civil nullable,
 * competência `ano-mês`, quem pagou, origem) e o escopo por Lar. Também o efeito
 * cascata na exclusão da Conta (a contagem de dependentes do `BillRepo`). Cada
 * teste cria a sua Conta (uuid novo), então rerodar não contamina as asserções.
 */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

describe("Seam 2 — guarda de cobertura (payments)", () => {
  it("test_database_url_presente_no_ci", () => {
    if (process.env.CI) expect(DATABASE_URL).toBeTruthy()
  })
})

/** Conta válida mínima para pendurar Lançamentos. */
function novaBill(householdId: string, over: Partial<NovaBill> = {}): NovaBill {
  return {
    householdId,
    nome: "Conta com baixa",
    descricao: null,
    icon: "home",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    ...over,
  }
}

suite("drizzlePaymentRepo (Seam 2 — Postgres real)", () => {
  let pool: Pool
  let db: ReturnType<typeof drizzle<typeof schema>>
  let larId: string
  let outroLarId: string
  let pessoa1: string
  let pessoa2: string

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })

    const [lar] = await db.insert(households).values({ nome: "Lar de teste payments" }).returning()
    larId = lar.id
    const [outro] = await db.insert(households).values({ nome: "Outro Lar payments" }).returning()
    outroLarId = outro.id

    // Pessoas do Lar (autoria do pagamento). E-mail derivado do uuid → único por execução.
    const [u1] = await db
      .insert(users)
      .values({
        householdId: larId,
        email: `p1-${larId}@teste.lar`,
        nome: "Ana",
        hue: 200,
        inicial: "A",
      })
      .returning()
    const [u2] = await db
      .insert(users)
      .values({
        householdId: larId,
        email: `p2-${larId}@teste.lar`,
        nome: "Beto",
        hue: 20,
        inicial: "B",
      })
      .returning()
    pessoa1 = u1.id
    pessoa2 = u2.id
  })

  afterAll(async () => {
    await pool?.end()
  })

  /** Cria uma Conta nova no Lar e devolve o billId, pra isolar cada teste. */
  async function billNova(): Promise<string> {
    const bill = await drizzleBillRepo(db).criarBill(novaBill(larId))
    return bill.id
  }

  function novo(billId: string, over: Partial<NovoPayment> = {}): NovoPayment {
    return {
      householdId: larId,
      billId,
      valor: 12990,
      dataPagamento: "2026-06-10",
      competencia: "2026-06",
      paidBy: pessoa1,
      ...over,
    }
  }

  it("test_criar_devolve_dominio_com_id_e_origem", async () => {
    const billId = await billNova()
    const repo = drizzlePaymentRepo(db)

    const pay = await repo.criarPayment(novo(billId))

    expect(pay.id).toBeTruthy()
    expect(pay.householdId).toBe(larId)
    expect(pay.billId).toBe(billId)
    expect(pay.valor).toBe(12990)
    expect(pay.dataPagamento).toBe("2026-06-10")
    expect(pay.competencia).toBe("2026-06")
    expect(pay.paidBy).toBe(pessoa1)
  })

  it("test_round_trip_preserva_valor_em_centavos", async () => {
    const billId = await billNova()
    const repo = drizzlePaymentRepo(db)
    const criado = await repo.criarPayment(novo(billId, { valor: 1_234_567 }))

    const lido = (await repo.listarPayments(larId, billId)).find((p) => p.id === criado.id)

    expect(lido?.valor).toBe(1_234_567)
    expect(Number.isInteger(lido?.valor)).toBe(true)
  })

  it("test_data_pagamento_nula_persiste", async () => {
    const billId = await billNova()
    const repo = drizzlePaymentRepo(db)
    const criado = await repo.criarPayment(novo(billId, { dataPagamento: null }))
    const lido = (await repo.listarPayments(larId, billId)).find((p) => p.id === criado.id)
    expect(lido?.dataPagamento).toBeNull()
  })

  it("test_listar_traz_so_a_conta_e_mais_recente_primeiro", async () => {
    const billId = await billNova()
    const outroBill = await billNova()
    const repo = drizzlePaymentRepo(db)
    await repo.criarPayment(novo(billId, { dataPagamento: "2026-04-10", competencia: "2026-04" }))
    await repo.criarPayment(novo(billId, { dataPagamento: "2026-06-10", competencia: "2026-06" }))
    await repo.criarPayment(
      novo(outroBill, { dataPagamento: "2026-05-10", competencia: "2026-05" }),
    )

    const daConta = await repo.listarPayments(larId, billId)

    expect(daConta).toHaveLength(2)
    expect(daConta.every((p) => p.billId === billId)).toBe(true)
    // mais recente (junho) antes do mais antigo (abril)
    expect(daConta.map((p) => p.competencia)).toEqual(["2026-06", "2026-04"])
  })

  it("test_listar_de_outro_lar_nao_enxerga", async () => {
    const billId = await billNova()
    const repo = drizzlePaymentRepo(db)
    await repo.criarPayment(novo(billId))
    expect(await repo.listarPayments(outroLarId, billId)).toHaveLength(0)
  })

  it("test_editar_persiste_a_nova_forma", async () => {
    const billId = await billNova()
    const repo = drizzlePaymentRepo(db)
    const criado = await repo.criarPayment(novo(billId))

    const editado = await repo.editarPayment(larId, criado.id, {
      valor: 15000,
      dataPagamento: "2026-06-15",
      competencia: "2026-06",
      paidBy: pessoa2,
    })

    expect(editado?.valor).toBe(15000)
    expect(editado?.dataPagamento).toBe("2026-06-15")
    expect(editado?.paidBy).toBe(pessoa2)
    expect(editado?.id).toBe(criado.id)
  })

  it("test_editar_inexistente_ou_de_outro_lar_devolve_null", async () => {
    const billId = await billNova()
    const repo = drizzlePaymentRepo(db)
    const criado = await repo.criarPayment(novo(billId))
    const dados = {
      valor: 1,
      dataPagamento: "2026-06-15",
      competencia: "2026-06",
      paidBy: pessoa1,
    }
    expect(
      await repo.editarPayment(larId, "00000000-0000-0000-0000-000000000000", dados),
    ).toBeNull()
    expect(await repo.editarPayment(outroLarId, criado.id, dados)).toBeNull()
  })

  it("test_deletar_remove_e_escopa_por_lar", async () => {
    const billId = await billNova()
    const repo = drizzlePaymentRepo(db)
    const criado = await repo.criarPayment(novo(billId))

    expect(await repo.deletarPayment(outroLarId, criado.id)).toBe(false)
    expect(await repo.deletarPayment(larId, criado.id)).toBe(true)
    expect(await repo.listarPayments(larId, billId)).toHaveLength(0)
  })

  it("test_contar_dependentes_reflete_os_lancamentos", async () => {
    const billId = await billNova()
    const repo = drizzlePaymentRepo(db)
    await repo.criarPayment(novo(billId, { competencia: "2026-05" }))
    await repo.criarPayment(novo(billId, { competencia: "2026-06" }))

    expect(await drizzleBillRepo(db).contarDependentes(larId, billId)).toEqual({
      lancamentos: 2,
      anexos: 0,
    })
  })

  it("test_deletar_a_conta_cascateia_os_lancamentos", async () => {
    const billId = await billNova()
    const payRepo = drizzlePaymentRepo(db)
    await payRepo.criarPayment(novo(billId))

    const removidos = await drizzleBillRepo(db).deletarBill(larId, billId)

    expect(removidos).toEqual({ lancamentos: 1, anexos: 0 })
    // o cascade levou o Lançamento junto
    expect(await payRepo.listarPayments(larId, billId)).toHaveLength(0)
  })
})
