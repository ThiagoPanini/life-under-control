import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chaveComprovante } from "@/core/domain/attachment"
import type { NovoAttachment } from "@/core/ports/attachment-repo"
import type { NovaBill } from "@/core/ports/bill-repo"
import { runMigrations } from "../../../migrate.mjs"
import { drizzleAttachmentRepo } from "./attachment-repo.drizzle"
import { drizzleBillRepo } from "./bill-repo.drizzle"
import { drizzlePaymentRepo } from "./payment-repo.drizzle"
import * as schema from "./schema"
import { households, users } from "./schema"

/**
 * Seam 2: o adapter Drizzle de `attachments` contra um Postgres real. Confere o
 * round-trip dos metadados (nome/tipo/tamanho/chave/quem subiu/quando), o escopo
 * por Lar, e o efeito cruzado em `BillRepo` (contar e cascatear Anexos junto da
 * Conta). Cada teste cria a sua Conta + Lançamento (uuid novo), então rerodar não
 * contamina as asserções. Sem `DATABASE_URL`, a suíte é pulada (roda no CI).
 */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

describe("Seam 2 — guarda de cobertura (attachments)", () => {
  it("test_database_url_presente_no_ci", () => {
    if (process.env.CI) expect(DATABASE_URL).toBeTruthy()
  })
})

/** Conta válida mínima para pendurar Lançamentos e Anexos. */
function novaBill(householdId: string, over: Partial<NovaBill> = {}): NovaBill {
  return {
    householdId,
    nome: "Conta com anexos",
    descricao: null,
    icon: "home",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    ...over,
  }
}

suite("drizzleAttachmentRepo (Seam 2 — Postgres real)", () => {
  let pool: Pool
  let db: ReturnType<typeof drizzle<typeof schema>>
  let larId: string
  let outroLarId: string
  let pessoa1: string

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })

    const [lar] = await db.insert(households).values({ nome: "Lar de teste anexos" }).returning()
    larId = lar.id
    const [outro] = await db.insert(households).values({ nome: "Outro Lar anexos" }).returning()
    outroLarId = outro.id

    const [u1] = await db
      .insert(users)
      .values({
        householdId: larId,
        email: `att-p1-${larId}@teste.lar`,
        nome: "Ana",
        hue: 200,
        inicial: "A",
      })
      .returning()
    pessoa1 = u1.id
  })

  afterAll(async () => {
    await pool?.end()
  })

  /** Cria uma Conta + um Lançamento novos no Lar e devolve o paymentId, pra isolar cada teste. */
  async function paymentNovo(): Promise<{ billId: string; paymentId: string }> {
    const bill = await drizzleBillRepo(db).criarBill(novaBill(larId))
    const pay = await drizzlePaymentRepo(db).criarPayment({
      householdId: larId,
      billId: bill.id,
      valor: 12990,
      dataPagamento: "2026-06-10",
      competencia: "2026-06",
      paidBy: pessoa1,
    })
    return { billId: bill.id, paymentId: pay.id }
  }

  function novo(
    paymentId: string,
    attachmentId: string,
    over: Partial<NovoAttachment> = {},
  ): NovoAttachment {
    return {
      id: attachmentId,
      householdId: larId,
      paymentId,
      chaveR2: chaveComprovante(larId, paymentId, attachmentId),
      uploadedBy: pessoa1,
      nomeOriginal: "comprovante.pdf",
      tipoMime: "application/pdf",
      tamanhoBytes: 48_000,
      ...over,
    }
  }

  /** Um uuid v4 sintético determinístico por sufixo, para o id explícito do Anexo. */
  function uuid(suffix: string): string {
    return `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`
  }

  it("test_criar_devolve_dominio_com_id_chave_e_quem_subiu", async () => {
    const { paymentId } = await paymentNovo()
    const repo = drizzleAttachmentRepo(db)
    const attId = uuid("1")

    const att = await repo.criarAttachment(novo(paymentId, attId))

    expect(att.id).toBe(attId)
    expect(att.householdId).toBe(larId)
    expect(att.paymentId).toBe(paymentId)
    expect(att.chaveR2).toBe(`${larId}/${paymentId}/${attId}`)
    expect(att.uploadedBy).toBe(pessoa1)
    expect(att.nomeOriginal).toBe("comprovante.pdf")
    expect(att.tipoMime).toBe("application/pdf")
    expect(att.tamanhoBytes).toBe(48_000)
    // criadoEm é o instante do banco, serializado em ISO.
    expect(att.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("test_round_trip_preserva_tamanho_inteiro", async () => {
    const { paymentId } = await paymentNovo()
    const repo = drizzleAttachmentRepo(db)
    const criado = await repo.criarAttachment(
      novo(paymentId, uuid("2"), { tamanhoBytes: 12_345_678 }),
    )

    const lido = await repo.obterAttachment(larId, criado.id)

    expect(lido?.tamanhoBytes).toBe(12_345_678)
    expect(Number.isInteger(lido?.tamanhoBytes)).toBe(true)
  })

  it("test_listar_traz_so_o_lancamento", async () => {
    const { paymentId } = await paymentNovo()
    const outro = await paymentNovo()
    const repo = drizzleAttachmentRepo(db)
    await repo.criarAttachment(novo(paymentId, uuid("3")))
    await repo.criarAttachment(novo(paymentId, uuid("4")))
    await repo.criarAttachment(novo(outro.paymentId, uuid("5")))

    const doLancamento = await repo.listarAttachments(larId, paymentId)

    expect(doLancamento).toHaveLength(2)
    expect(doLancamento.every((a) => a.paymentId === paymentId)).toBe(true)
  })

  it("test_listar_e_obter_de_outro_lar_nao_enxergam", async () => {
    const { paymentId } = await paymentNovo()
    const repo = drizzleAttachmentRepo(db)
    const criado = await repo.criarAttachment(novo(paymentId, uuid("6")))

    expect(await repo.listarAttachments(outroLarId, paymentId)).toHaveLength(0)
    expect(await repo.obterAttachment(outroLarId, criado.id)).toBeNull()
  })

  it("test_deletar_remove_e_escopa_por_lar", async () => {
    const { paymentId } = await paymentNovo()
    const repo = drizzleAttachmentRepo(db)
    const criado = await repo.criarAttachment(novo(paymentId, uuid("7")))

    expect(await repo.deletarAttachment(outroLarId, criado.id)).toBeNull()
    const removido = await repo.deletarAttachment(larId, criado.id)
    expect(removido?.id).toBe(criado.id)
    expect(removido?.chaveR2).toBe(criado.chaveR2)
    expect(await repo.listarAttachments(larId, paymentId)).toHaveLength(0)
  })

  it("test_apagar_o_lancamento_cascateia_os_anexos", async () => {
    const { paymentId } = await paymentNovo()
    const attRepo = drizzleAttachmentRepo(db)
    await attRepo.criarAttachment(novo(paymentId, uuid("8")))

    await drizzlePaymentRepo(db).deletarPayment(larId, paymentId)

    expect(await attRepo.listarAttachments(larId, paymentId)).toHaveLength(0)
  })

  it("test_contar_dependentes_inclui_os_anexos", async () => {
    const { billId, paymentId } = await paymentNovo()
    const attRepo = drizzleAttachmentRepo(db)
    await attRepo.criarAttachment(novo(paymentId, uuid("9")))
    await attRepo.criarAttachment(novo(paymentId, uuid("10")))

    expect(await drizzleBillRepo(db).contarDependentes(larId, billId)).toEqual({
      lancamentos: 1,
      anexos: 2,
    })
  })

  it("test_deletar_a_conta_cascateia_e_conta_os_anexos", async () => {
    const { billId, paymentId } = await paymentNovo()
    const attRepo = drizzleAttachmentRepo(db)
    await attRepo.criarAttachment(novo(paymentId, uuid("11")))

    const removidos = await drizzleBillRepo(db).deletarBill(larId, billId)

    expect(removidos).toEqual({ lancamentos: 1, anexos: 1 })
    expect(await attRepo.listarAttachments(larId, paymentId)).toHaveLength(0)
  })
})
