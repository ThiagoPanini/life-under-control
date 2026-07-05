import { describe, expect, it } from "vitest"
import type { LinhaManifesto } from "@/core/domain/backfill"
import type { AttachmentStore } from "@/core/ports/attachment-store"
import { fakeAttachmentRepo } from "./attachment-repo.fake"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { importBackfill } from "./import-backfill"
import { fakePaymentRepo } from "./payment-repo.fake"

function linha(over: Partial<LinhaManifesto> = {}): LinhaManifesto {
  return {
    billId: "bill-luz",
    competencia: "2024-03",
    dataPagamento: "2024-03-15",
    valor: 20390,
    valorRecibo: 20390,
    paidBy: "p-thi",
    recibo: null,
    flags: ["ok"],
    revisar: false,
    ...over,
  }
}

/** Loader de recibo que nunca acha bytes — para os cenários sem upload. */
const semBytes = async () => null

describe("importBackfill (Seam 2 — import determinístico)", () => {
  it("test_importa_lancamento_com_data_do_manifesto", async () => {
    const repo = fakePaymentRepo()
    const r = await importBackfill(
      repo,
      fakeAttachmentStore(),
      fakeAttachmentRepo(),
      semBytes,
      "h-1",
      [linha()],
    )

    expect(r.criados).toHaveLength(1)
    expect(r.criados[0]).toMatchObject({
      householdId: "h-1",
      billId: "bill-luz",
      competencia: "2024-03",
      dataPagamento: "2024-03-15",
      valor: 20390,
      paidBy: "p-thi",
    })
    expect(await repo.listarPayments("h-1", "bill-luz")).toHaveLength(1)
  })

  it("test_data_nula_persiste_pago_sem_data", async () => {
    const repo = fakePaymentRepo()
    const r = await importBackfill(
      repo,
      fakeAttachmentStore(),
      fakeAttachmentRepo(),
      semBytes,
      "h-1",
      [linha({ dataPagamento: null, flags: ["sem-recibo"] })],
    )

    expect(r.criados[0].dataPagamento).toBeNull()
  })

  it("test_linha_em_revisao_nao_e_inserida", async () => {
    const repo = fakePaymentRepo()
    const r = await importBackfill(
      repo,
      fakeAttachmentStore(),
      fakeAttachmentRepo(),
      semBytes,
      "h-1",
      [linha({ revisar: true, flags: ["valor-divergente"] })],
    )

    expect(r.criados).toHaveLength(0)
    expect(r.emRevisao).toHaveLength(1)
    expect(await repo.listarPayments("h-1", "bill-luz")).toHaveLength(0)
  })

  it("test_idempotente_reimportar_mesmo_manifesto_nao_duplica", async () => {
    const repo = fakePaymentRepo()
    const store = fakeAttachmentStore()
    const att = fakeAttachmentRepo()
    const manifesto = [linha(), linha({ competencia: "2024-04", dataPagamento: null })]

    const primeiro = await importBackfill(repo, store, att, semBytes, "h-1", manifesto)
    const segundo = await importBackfill(repo, store, att, semBytes, "h-1", manifesto)

    expect(primeiro.criados).toHaveLength(2)
    expect(segundo.criados).toHaveLength(0)
    expect(segundo.pulados).toBe(2)
    expect(await repo.listarPayments("h-1", "bill-luz")).toHaveLength(2)
  })

  it("test_recibo_sobe_pro_store_e_registra_anexo", async () => {
    const repo = fakePaymentRepo()
    const store = fakeAttachmentStore()
    const att = fakeAttachmentRepo()
    const carregar = async () => ({
      conteudo: new Uint8Array([1, 2, 3, 4]),
      tipoMime: "image/jpeg",
    })

    const r = await importBackfill(repo, store, att, carregar, "h-1", [
      linha({ recibo: { arquivo: "luz/2024/conta-luz-202403.jpeg", tipoMime: "image/jpeg" } }),
    ])

    expect(r.anexos).toBe(1)
    expect(store.chaves()).toHaveLength(1)
    const pay = r.criados[0]
    const anexos = await att.listarAttachments("h-1", pay.id)
    expect(anexos).toHaveLength(1)
    expect(anexos[0].tamanhoBytes).toBe(4)
    expect(anexos[0].tipoMime).toBe("image/jpeg")
  })

  it("test_linha_com_valor_invalido_nao_insere_e_vai_pra_invalidos", async () => {
    const repo = fakePaymentRepo()
    const r = await importBackfill(
      repo,
      fakeAttachmentStore(),
      fakeAttachmentRepo(),
      semBytes,
      "h-1",
      [linha({ valor: 0, flags: ["sem-recibo"] })],
    )

    expect(r.criados).toHaveLength(0)
    expect(r.invalidos).toHaveLength(1)
    expect(await repo.listarPayments("h-1", "bill-luz")).toHaveLength(0)
  })

  it("test_sem_bytes_do_recibo_lancamento_persiste_sem_anexo", async () => {
    const repo = fakePaymentRepo()
    const store = fakeAttachmentStore()
    const att = fakeAttachmentRepo()

    const r = await importBackfill(repo, store, att, semBytes, "h-1", [
      linha({ recibo: { arquivo: "luz/2024/conta-luz-202403.jpeg", tipoMime: "image/jpeg" } }),
    ])

    expect(r.criados).toHaveLength(1)
    expect(r.anexos).toBe(0)
    expect(r.falhasAnexo).toHaveLength(1)
    expect(store.chaves()).toHaveLength(0)
  })

  it("test_reanexa_comprovante_em_lancamento_preexistente_sem_anexo", async () => {
    const repo = fakePaymentRepo()
    const store = fakeAttachmentStore()
    const att = fakeAttachmentRepo()
    const manifesto = [
      linha({ recibo: { arquivo: "luz/2024/conta-luz-202403.jpeg", tipoMime: "image/jpeg" } }),
    ]
    const comBytes = async () => ({
      conteudo: new Uint8Array([1, 2, 3, 4]),
      tipoMime: "image/jpeg",
    })

    // 1ª rodada: arquivo inacessível — o Lançamento entra, mas fica sem anexo.
    const primeiro = await importBackfill(repo, store, att, semBytes, "h-1", manifesto)
    expect(primeiro.criados).toHaveLength(1)
    expect(primeiro.anexos).toBe(0)

    // 2ª rodada: o arquivo agora abre — não duplica o Lançamento, mas repara o anexo.
    const segundo = await importBackfill(repo, store, att, comBytes, "h-1", manifesto)
    expect(segundo.criados).toHaveLength(0)
    expect(segundo.pulados).toBe(1)
    expect(segundo.anexos).toBe(1)

    const pay = primeiro.criados[0]
    expect(await att.listarAttachments("h-1", pay.id)).toHaveLength(1)
  })

  it("test_nao_reanexa_quando_lancamento_preexistente_ja_tem_anexo", async () => {
    const repo = fakePaymentRepo()
    const store = fakeAttachmentStore()
    const att = fakeAttachmentRepo()
    const manifesto = [
      linha({ recibo: { arquivo: "luz/2024/conta-luz-202403.jpeg", tipoMime: "image/jpeg" } }),
    ]
    const comBytes = async () => ({
      conteudo: new Uint8Array([1, 2, 3, 4]),
      tipoMime: "image/jpeg",
    })

    await importBackfill(repo, store, att, comBytes, "h-1", manifesto)
    const segundo = await importBackfill(repo, store, att, comBytes, "h-1", manifesto)

    expect(segundo.pulados).toBe(1)
    expect(segundo.anexos).toBe(0) // já tinha anexo: não re-sobe
    const pay = (await repo.listarPayments("h-1", "bill-luz"))[0]
    expect(await att.listarAttachments("h-1", pay.id)).toHaveLength(1)
  })

  it("test_falha_no_upload_nao_aborta_o_lote", async () => {
    const repo = fakePaymentRepo()
    const att = fakeAttachmentRepo()
    // Store que estoura no `enviar` (R2 fora do ar / objeto grande demais).
    const storeQueFalha: AttachmentStore = {
      ...fakeAttachmentStore(),
      async enviar() {
        throw new Error("R2 fora do ar")
      },
    }
    const comBytes = async () => ({
      conteudo: new Uint8Array([1, 2, 3, 4]),
      tipoMime: "image/jpeg",
    })

    const r = await importBackfill(repo, storeQueFalha, att, comBytes, "h-1", [
      linha({ recibo: { arquivo: "luz/2024/conta-luz-202403.jpeg", tipoMime: "image/jpeg" } }),
      linha({
        competencia: "2024-04",
        recibo: { arquivo: "luz/2024/conta-luz-202404.jpeg", tipoMime: "image/jpeg" },
      }),
    ])

    // O lote não aborta: os dois Lançamentos entram, só os anexos falham.
    expect(r.criados).toHaveLength(2)
    expect(r.anexos).toBe(0)
    expect(r.falhasAnexo).toHaveLength(2)
    expect(await repo.listarPayments("h-1", "bill-luz")).toHaveLength(2)
  })

  it("test_anexo_recebe_id_uuid_e_nao_o_derivado_do_payment", async () => {
    const repo = fakePaymentRepo()
    const store = fakeAttachmentStore()
    const att = fakeAttachmentRepo()
    const comBytes = async () => ({
      conteudo: new Uint8Array([1, 2, 3, 4]),
      tipoMime: "image/jpeg",
    })

    const r = await importBackfill(repo, store, att, comBytes, "h-1", [
      linha({ recibo: { arquivo: "luz/2024/conta-luz-202403.jpeg", tipoMime: "image/jpeg" } }),
    ])

    const pay = r.criados[0]
    const anexos = await att.listarAttachments("h-1", pay.id)
    expect(anexos).toHaveLength(1)
    // `attachments.id` é coluna `uuid` no Postgres: o id do Anexo tem de ser um UUID,
    // não o antigo `${paymentId}-0` — que estourava `22P02 invalid input syntax for
    // type uuid` na ingestão real (o comprovante subia pro R2, mas nenhuma linha entrava).
    expect(anexos[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(anexos[0].id).not.toBe(`${pay.id}-0`)
  })

  it("test_usa_o_gerador_de_id_injetado_pro_anexo", async () => {
    const repo = fakePaymentRepo()
    const store = fakeAttachmentStore()
    const att = fakeAttachmentRepo()
    const comBytes = async () => ({
      conteudo: new Uint8Array([1, 2, 3, 4]),
      tipoMime: "image/jpeg",
    })
    const idFixo = "11111111-1111-4111-8111-111111111111"

    const r = await importBackfill(
      repo,
      store,
      att,
      comBytes,
      "h-1",
      [linha({ recibo: { arquivo: "luz/2024/conta-luz-202403.jpeg", tipoMime: "image/jpeg" } })],
      () => idFixo,
    )

    const anexos = await att.listarAttachments("h-1", r.criados[0].id)
    expect(anexos[0].id).toBe(idFixo)
  })
})
