import { randomUUID } from "node:crypto"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chaveStaging, type NovaPaymentProposal } from "@/core/domain/payment-proposal"
import { runMigrations } from "../../../migrate.mjs"
import { drizzleWhatsappProposalRepo } from "./payment-proposal-repo.drizzle"
import * as schema from "./schema"
import { households, users, whatsappProposals } from "./schema"

/**
 * Seam 2: o adapter Drizzle da Proposta de Lançamento contra um Postgres real
 * (issue #158). Confere o round-trip da forma de domínio (campos do recibo
 * anuláveis, estado default), a detecção de repetido por hash (ignora estado
 * terminal) e o escopo por Lar. Cada Proposta usa um uuid novo — rerodar não
 * contamina.
 */
const DATABASE_URL = process.env.DATABASE_URL
const suite = DATABASE_URL ? describe : describe.skip

describe("Seam 2 — guarda de cobertura (whatsapp_proposals)", () => {
  it("test_database_url_presente_no_ci", () => {
    if (process.env.CI) expect(DATABASE_URL).toBeTruthy()
  })
})

suite("drizzleWhatsappProposalRepo (Seam 2 — Postgres real)", () => {
  let pool: Pool
  let db: ReturnType<typeof drizzle<typeof schema>>
  let larId: string
  let outroLarId: string
  let pessoa: string

  beforeAll(async () => {
    await runMigrations(DATABASE_URL as string)
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })

    const [lar] = await db.insert(households).values({ nome: "Lar proposals" }).returning()
    larId = lar.id
    const [outro] = await db.insert(households).values({ nome: "Outro Lar proposals" }).returning()
    outroLarId = outro.id
    const [u] = await db
      .insert(users)
      .values({
        householdId: larId,
        email: `p-${larId}@teste.lar`,
        nome: "Ana",
        hue: 200,
        inicial: "A",
      })
      .returning()
    pessoa = u.id
  })

  afterAll(async () => {
    await pool?.end()
  })

  function nova(over: Partial<NovaPaymentProposal> = {}): NovaPaymentProposal {
    const id = randomUUID()
    return {
      id,
      householdId: larId,
      waMessageId: `wamid.${id}`,
      bytesHash: randomUUID().replace(/-/g, ""),
      paidBy: pessoa,
      billId: null,
      valorCentavos: 123456,
      dataPagamento: "2026-07-08",
      competencia: "2026-07",
      favorecido: "Condomínio",
      stagingKey: chaveStaging(larId, id),
      tipoMime: "image/jpeg",
      ...over,
    }
  }

  it("test_criar_persiste_e_devolve_dominio_no_estado_proposta", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())

    expect(criada.id).toBeTruthy()
    expect(criada.householdId).toBe(larId)
    expect(criada.valorCentavos).toBe(123456)
    expect(criada.dataPagamento).toBe("2026-07-08")
    expect(criada.competencia).toBe("2026-07")
    expect(criada.estado).toBe("proposta")
    expect(criada.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("test_campos_ilegiveis_persistem_nulos", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(
      nova({
        billId: null,
        valorCentavos: null,
        dataPagamento: null,
        competencia: null,
        favorecido: null,
      }),
    )

    expect(criada.valorCentavos).toBeNull()
    expect(criada.dataPagamento).toBeNull()
    expect(criada.competencia).toBeNull()
    expect(criada.favorecido).toBeNull()
    expect(criada.billId).toBeNull()
  })

  it("test_obter_ativa_por_hash_acha_a_proposta_aberta", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())

    const achada = await repo.obterAtivaPorHash(larId, criada.bytesHash)

    expect(achada?.id).toBe(criada.id)
  })

  it("test_obter_por_hash_ignora_estado_terminal", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const hash = randomUUID().replace(/-/g, "")
    const id = randomUUID()
    // Insere direto no estado terminal (o repo só cria `proposta`): cancelada não
    // conta como ativa — reenviar depois de cancelar abre Proposta nova.
    await db.insert(whatsappProposals).values({
      id,
      householdId: larId,
      waMessageId: `wamid.${id}`,
      bytesHash: hash,
      paidBy: pessoa,
      stagingKey: chaveStaging(larId, id),
      tipoMime: "image/jpeg",
      estado: "cancelada",
    })

    expect(await repo.obterAtivaPorHash(larId, hash)).toBeNull()
  })

  it("test_obter_por_hash_escapa_por_lar", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())

    // Mesmo hash, outro Lar → invisível (acesso simétrico é dentro do Lar, #1).
    expect(await repo.obterAtivaPorHash(outroLarId, criada.bytesHash)).toBeNull()
  })

  it("test_confirmar_faz_cas_proposta_para_confirmada_e_e_idempotente", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())

    expect((await repo.confirmar(larId, criada.id))?.estado).toBe("confirmada")
    // 2º Confirmar não casa mais o WHERE estado='proposta' → null (idempotência).
    expect(await repo.confirmar(larId, criada.id)).toBeNull()
  })

  it("test_cancelar_faz_cas_e_marcar_expirada_ignora_ja_terminal", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())

    expect((await repo.cancelar(larId, criada.id))?.estado).toBe("cancelada")
    // Já cancelada: marcarExpirada (CAS de `proposta`) não casa e devolve null.
    expect(await repo.marcarExpirada(larId, criada.id)).toBeNull()
  })

  it("test_obter_por_id_acha_no_lar_e_escapa_de_outro", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())

    expect((await repo.obterPorId(larId, criada.id))?.id).toBe(criada.id)
    expect(await repo.obterPorId(outroLarId, criada.id)).toBeNull()
  })

  it("test_listar_abertas_traz_a_aberta_e_nao_a_confirmada", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const aberta = await repo.criar(nova())
    const confirmada = await repo.criar(nova())
    await repo.confirmar(larId, confirmada.id)

    const ids = (await repo.listarAbertas()).map((p) => p.id)
    expect(ids).toContain(aberta.id)
    expect(ids).not.toContain(confirmada.id)
  })

  it("test_definir_aguardando_marca_o_campo_e_a_pessoa_e_obter_acha", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())

    const marcada = await repo.definirAguardando(larId, criada.id, "valor", pessoa)
    expect(marcada?.aguardandoCampo).toBe("valor")
    expect(marcada?.aguardandoPor).toBe(pessoa)

    const achada = await repo.obterAguardandoPor(larId, pessoa)
    expect(achada?.id).toBe(criada.id)
  })

  it("test_definir_aguardando_e_um_slot_por_pessoa", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const p1 = await repo.criar(nova())
    const p2 = await repo.criar(nova())

    await repo.definirAguardando(larId, p1.id, "valor", pessoa)
    await repo.definirAguardando(larId, p2.id, "data", pessoa)

    // O 2º setou p2 e liberou p1 — a Pessoa espera texto numa única Proposta.
    expect((await repo.obterPorId(larId, p1.id))?.aguardandoCampo).toBeNull()
    expect((await repo.obterAguardandoPor(larId, pessoa))?.id).toBe(p2.id)
  })

  it("test_definir_aguardando_com_cas_falho_preserva_a_pendencia_existente", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const p1 = await repo.criar(nova())
    const p2 = await repo.criar(nova())
    await repo.definirAguardando(larId, p1.id, "valor", pessoa)
    await repo.confirmar(larId, p2.id) // p2 sai de `proposta` → o CAS do alvo vai falhar

    const alvo = await repo.definirAguardando(larId, p2.id, "data", pessoa)

    // Ordem certa (#178): seta o alvo primeiro; CAS falho → null e NÃO zera a
    // pendência de p1 à toa (limpar-antes faria isso).
    expect(alvo).toBeNull()
    const achada = await repo.obterAguardandoPor(larId, pessoa)
    expect(achada?.id).toBe(p1.id)
    expect(achada?.aguardandoCampo).toBe("valor")
  })

  it("test_atualizar_campo_grava_o_valor_e_limpa_a_edicao_pendente", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova({ valorCentavos: null }))
    await repo.definirAguardando(larId, criada.id, "valor", pessoa)

    const atualizada = await repo.atualizarCampo(larId, criada.id, { valorCentavos: 25343 })
    expect(atualizada?.valorCentavos).toBe(25343)
    expect(atualizada?.aguardandoCampo).toBeNull()
    expect(await repo.obterAguardandoPor(larId, pessoa)).toBeNull()
  })

  it("test_atualizar_competencia_grava_o_mes_no_estado_proposta", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova({ competencia: "2026-07" }))

    const atualizada = await repo.atualizarCompetencia(larId, criada.id, "2026-06")
    expect(atualizada?.competencia).toBe("2026-06")
  })

  it("test_atualizar_competencia_nao_larga_a_edicao_de_texto_pendente", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())
    await repo.definirAguardando(larId, criada.id, "valor", pessoa)

    await repo.atualizarCompetencia(larId, criada.id, "2026-06")

    // Editar por lista (Mês) é ortogonal à pendência de texto: ela sobrevive (#178).
    expect((await repo.obterAguardandoPor(larId, pessoa))?.id).toBe(criada.id)
  })

  it("test_limpar_aguardando_libera_a_pessoa", async () => {
    const repo = drizzleWhatsappProposalRepo(db)
    const criada = await repo.criar(nova())
    await repo.definirAguardando(larId, criada.id, "favorecido", pessoa)

    await repo.limparAguardando(larId, pessoa)
    expect(await repo.obterAguardandoPor(larId, pessoa)).toBeNull()
  })
})
