import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { NovaBill } from "@/core/ports/bill-repo"
import { runMigrations } from "../../../migrate.mjs"
import { drizzleBillRepo } from "./bill-repo.drizzle"
import * as schema from "./schema"
import { households } from "./schema"

/**
 * Seam 2: o adapter Drizzle de `bills` contra um Postgres real. Confere que o
 * round-trip preserva a forma de domínio (Recorrência + união DueRule + offset
 * + estado), sem reapresentar valor (invariante #5). Cada execução cria um Lar
 * descartável (uuid novo), então rerodar não contamina as asserções.
 */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

describe("Seam 2 — guarda de cobertura (bills)", () => {
  it("test_database_url_presente_no_ci", () => {
    if (process.env.CI) expect(DATABASE_URL).toBeTruthy()
  })
})

/** Conta válida mínima; cada teste muta o que interessa. */
function nova(householdId: string, over: Partial<NovaBill> = {}): NovaBill {
  return {
    householdId,
    nome: "Conta",
    descricao: null,
    icon: "home",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    ...over,
  }
}

suite("drizzleBillRepo (Seam 2 — Postgres real)", () => {
  let pool: Pool
  let db: ReturnType<typeof drizzle<typeof schema>>
  let larId: string

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    const [lar] = await db.insert(households).values({ nome: "Lar de teste bills" }).returning()
    larId = lar.id
  })

  afterAll(async () => {
    await pool?.end()
  })

  it("test_criar_devolve_dominio_com_id_e_estado_ativa", async () => {
    const repo = drizzleBillRepo(db)

    const bill = await repo.criarBill(nova(larId, { nome: "Condomínio", dueMonthOffset: 1 }))

    expect(bill.id).toBeTruthy()
    expect(bill.householdId).toBe(larId)
    expect(bill.estado).toBe("ativa")
    expect(bill.descricao).toBeNull()
    expect(bill.recurrence).toEqual({ intervalMonths: 1, anchorMonth: null })
    expect(bill.dueRule).toEqual({ kind: "dia-fixo", day: 10 })
    expect(bill.dueMonthOffset).toBe(1)
  })

  it("test_round_trip_preserva_n_esimo_dia_util_e_ancora", async () => {
    const repo = drizzleBillRepo(db)

    const criada = await repo.criarBill(
      nova(larId, {
        nome: "Plano de saúde",
        icon: "heart-pulse",
        descricao: "família",
        recurrence: { intervalMonths: 12, anchorMonth: 3 },
        dueRule: { kind: "n-esimo-dia-util", nth: 5 },
      }),
    )

    const lidas = await repo.listarBills(larId)
    const lida = lidas.find((b) => b.id === criada.id)

    expect(lida?.descricao).toBe("família")
    expect(lida?.recurrence).toEqual({ intervalMonths: 12, anchorMonth: 3 })
    expect(lida?.dueRule).toEqual({ kind: "n-esimo-dia-util", nth: 5 })
  })

  it("test_round_trip_preserva_ultimo_dia_util", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(
      nova(larId, { nome: "DAS", icon: "receipt", dueRule: { kind: "ultimo-dia-util" } }),
    )
    const lida = (await repo.listarBills(larId)).find((b) => b.id === criada.id)
    expect(lida?.dueRule).toEqual({ kind: "ultimo-dia-util" })
  })

  it("test_listar_traz_so_o_lar_ordenado_por_nome", async () => {
    const outroLar = (await db.insert(households).values({ nome: "Outro Lar" }).returning())[0].id
    const repo = drizzleBillRepo(db)
    await repo.criarBill(nova(outroLar, { nome: "Zeladoria do outro Lar" }))
    await repo.criarBill(nova(larId, { nome: "Internet", icon: "wifi" }))
    await repo.criarBill(nova(larId, { nome: "Luz", icon: "zap" }))

    const doLar = await repo.listarBills(larId)

    expect(doLar.every((b) => b.householdId === larId)).toBe(true)
    const nomes = doLar.map((b) => b.nome)
    expect(nomes).toContain("Internet")
    expect(nomes).toContain("Luz")
    expect(nomes).not.toContain("Zeladoria do outro Lar")
    // ordenado por nome (asc). Nomes ASCII: a ordem por byte e por locale coincidem,
    // então a asserção não depende da collation do Postgres (C vs. pt_BR).
    expect(nomes.indexOf("Internet")).toBeLessThan(nomes.indexOf("Luz"))
  })

  it("test_obter_traz_a_conta_do_lar_e_null_fora_dela", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Streaming", icon: "tv" }))

    expect((await repo.obterBill(larId, criada.id))?.id).toBe(criada.id)
    // escopo por Lar: outro Lar não enxerga; id inexistente também é null
    expect(await repo.obterBill("00000000-0000-0000-0000-000000000000", criada.id)).toBeNull()
    expect(await repo.obterBill(larId, "00000000-0000-0000-0000-000000000000")).toBeNull()
  })

  it("test_editar_persiste_a_nova_regra_e_preserva_identidade", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Academia", icon: "dumbbell" }))

    const editada = await repo.editarBill(larId, criada.id, {
      nome: "Academia Premium",
      descricao: "plano anual",
      icon: "dumbbell",
      recurrence: { intervalMonths: 12, anchorMonth: 1 },
      dueRule: { kind: "ultimo-dia-util" },
      dueMonthOffset: 0,
    })

    expect(editada?.id).toBe(criada.id)
    expect(editada?.nome).toBe("Academia Premium")
    expect(editada?.recurrence).toEqual({ intervalMonths: 12, anchorMonth: 1 })
    expect(editada?.dueRule).toEqual({ kind: "ultimo-dia-util" })
    // o round-trip de leitura confirma a persistência
    const relida = await repo.obterBill(larId, criada.id)
    expect(relida?.nome).toBe("Academia Premium")
  })

  it("test_editar_conta_inexistente_devolve_null", async () => {
    const repo = drizzleBillRepo(db)
    const r = await repo.editarBill(larId, "00000000-0000-0000-0000-000000000000", {
      nome: "Fantasma",
      descricao: null,
      icon: "home",
      recurrence: { intervalMonths: 1, anchorMonth: null },
      dueRule: { kind: "dia-fixo", day: 1 },
      dueMonthOffset: 0,
    })
    expect(r).toBeNull()
  })

  it("test_encerrar_grava_estado_e_data_e_sai_da_ativa", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "TV a cabo", icon: "tv" }))
    expect(criada.estado).toBe("ativa")
    expect(criada.encerradaEm).toBeNull()

    const encerrada = await repo.encerrarBill(larId, criada.id, "2026-06-29")

    expect(encerrada?.estado).toBe("encerrada")
    expect(encerrada?.encerradaEm).toBe("2026-06-29")
    // relida do banco mantém o encerramento (o check estado⇔data passou)
    const relida = await repo.obterBill(larId, criada.id)
    expect(relida?.estado).toBe("encerrada")
    expect(relida?.encerradaEm).toBe("2026-06-29")
  })

  it("test_reencerrar_nao_acha_ativa_e_preserva_a_data", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Revista", icon: "receipt" }))
    await repo.encerrarBill(larId, criada.id, "2026-06-29")

    // segundo encerrar não encontra Conta ativa (WHERE estado='ativa') → null
    const reencerrada = await repo.encerrarBill(larId, criada.id, "2026-12-31")

    expect(reencerrada).toBeNull()
    const relida = await repo.obterBill(larId, criada.id)
    expect(relida?.encerradaEm).toBe("2026-06-29")
  })

  it("test_reativar_volta_a_ativa_e_limpa_a_data", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Streaming", icon: "tv" }))
    await repo.encerrarBill(larId, criada.id, "2026-06-29")

    const reativada = await repo.reativarBill(larId, criada.id)

    expect(reativada?.estado).toBe("ativa")
    expect(reativada?.encerradaEm).toBeNull()
    // relida do banco: o UPDATE limpou a data junto (o check estado⇔data passou)
    const relida = await repo.obterBill(larId, criada.id)
    expect(relida?.estado).toBe("ativa")
    expect(relida?.encerradaEm).toBeNull()
  })

  it("test_reativar_conta_ativa_devolve_null", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Jornal", icon: "receipt" }))

    // nunca encerrada: não há linha 'encerrada' (WHERE estado='encerrada') → null
    const reativada = await repo.reativarBill(larId, criada.id)

    expect(reativada).toBeNull()
    const relida = await repo.obterBill(larId, criada.id)
    expect(relida?.estado).toBe("ativa")
  })

  it("test_reativar_de_outro_lar_devolve_null", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Academia", icon: "dumbbell" }))
    await repo.encerrarBill(larId, criada.id, "2026-06-29")

    // escopo por Lar: outro Lar não enxerga a Conta encerrada → null (#1)
    const reativada = await repo.reativarBill("00000000-0000-0000-0000-000000000000", criada.id)

    expect(reativada).toBeNull()
    const relida = await repo.obterBill(larId, criada.id)
    expect(relida?.estado).toBe("encerrada")
  })

  it("test_contar_dependentes_zero_sem_lancamentos", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Seguro", icon: "shield" }))
    // Lançamentos/Anexos ainda não existem (#19+): contagem honesta de zero.
    expect(await repo.contarDependentes(larId, criada.id)).toEqual({ lancamentos: 0, anexos: 0 })
  })

  it("test_deletar_remove_a_conta_e_devolve_contagem", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Cartão", icon: "credit-card" }))

    const removidos = await repo.deletarBill(larId, criada.id)

    expect(removidos).toEqual({ lancamentos: 0, anexos: 0 })
    expect(await repo.obterBill(larId, criada.id)).toBeNull()
  })

  it("test_deletar_conta_inexistente_devolve_null", async () => {
    const repo = drizzleBillRepo(db)
    expect(await repo.deletarBill(larId, "00000000-0000-0000-0000-000000000000")).toBeNull()
  })

  it("test_criar_nasce_sem_logo", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Água", icon: "droplet" }))
    expect(criada.logoKey).toBeNull()
  })

  it("test_definir_logo_persiste_e_limpar_volta_a_null", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Gás", icon: "flame" }))
    const chave = `finance/bills/${larId}/${criada.id}/logo`

    const comLogo = await repo.definirLogo(larId, criada.id, chave)
    expect(comLogo?.logoKey).toBe(chave)
    const relida = await repo.obterBill(larId, criada.id)
    expect(relida?.logoKey).toBe(chave)

    const semLogo = await repo.definirLogo(larId, criada.id, null)
    expect(semLogo?.logoKey).toBeNull()
  })

  it("test_definir_logo_de_outro_lar_devolve_null", async () => {
    const repo = drizzleBillRepo(db)
    const criada = await repo.criarBill(nova(larId, { nome: "Condomínio 2", icon: "building-2" }))
    const r = await repo.definirLogo("00000000-0000-0000-0000-000000000000", criada.id, "chave")
    expect(r).toBeNull()
  })
})
