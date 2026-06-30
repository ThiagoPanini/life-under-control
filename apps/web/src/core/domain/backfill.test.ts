import { describe, expect, it } from "vitest"
import { construirManifesto, type EntradaConta, lerNomeRecibo } from "./backfill"

function entrada(over: Partial<EntradaConta> = {}): EntradaConta {
  return {
    billId: "bill-luz",
    paidBy: "p-thi",
    planilha: [],
    recibos: [],
    ...over,
  }
}

describe("construirManifesto (Seam 1 — cross-check planilha × comprovantes)", () => {
  it("test_recibo_legivel_casa_competencia_e_importa_com_data", () => {
    const m = construirManifesto(
      entrada({
        planilha: [{ competencia: "2024-03", valorCentavos: 20390, status: "Pago" }],
        recibos: [
          {
            arquivo: "luz/2024/conta-luz-202403.jpeg",
            competencia: "2024-03",
            dataPagamento: "2024-03-15",
            valorRecibo: 20390,
            tipoMime: "image/jpeg",
          },
        ],
      }),
    )

    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({
      billId: "bill-luz",
      competencia: "2024-03",
      dataPagamento: "2024-03-15",
      valor: 20390,
      paidBy: "p-thi",
      revisar: false,
    })
    expect(m[0].recibo?.arquivo).toContain("conta-luz-202403")
    expect(m[0].flags).toEqual(["ok"])
  })

  it("test_sem_recibo_vira_pago_sem_data_e_nao_pede_revisao", () => {
    const m = construirManifesto(
      entrada({
        planilha: [{ competencia: "2024-04", valorCentavos: 18000, status: "Pago" }],
        recibos: [],
      }),
    )

    expect(m[0].dataPagamento).toBeNull()
    expect(m[0].valor).toBe(18000)
    expect(m[0].recibo).toBeNull()
    expect(m[0].flags).toContain("sem-recibo")
    expect(m[0].revisar).toBe(false)
  })

  it("test_valor_divergente_marca_revisao_sem_inserir", () => {
    const m = construirManifesto(
      entrada({
        planilha: [{ competencia: "2024-05", valorCentavos: 20000, status: "Pago" }],
        recibos: [
          {
            arquivo: "luz/2024/conta-luz-202405.jpg",
            competencia: "2024-05",
            dataPagamento: "2024-05-10",
            valorRecibo: 25000,
            tipoMime: "image/jpeg",
          },
        ],
      }),
    )

    expect(m[0].flags).toContain("valor-divergente")
    expect(m[0].revisar).toBe(true)
  })

  it("test_recibo_sem_data_legivel_importa_sem_data", () => {
    const m = construirManifesto(
      entrada({
        planilha: [{ competencia: "2024-06", valorCentavos: 19000, status: "Pago" }],
        recibos: [
          {
            arquivo: "luz/2024/conta-luz-202406.jpg",
            competencia: "2024-06",
            dataPagamento: null,
            valorRecibo: 19000,
            tipoMime: "image/jpeg",
          },
        ],
      }),
    )

    expect(m[0].dataPagamento).toBeNull()
    expect(m[0].flags).toContain("data-ilegivel")
    expect(m[0].revisar).toBe(false)
    expect(m[0].recibo).not.toBeNull()
  })

  it("test_recibo_orfao_sem_linha_na_planilha_vai_pra_revisao", () => {
    const m = construirManifesto(
      entrada({
        planilha: [],
        recibos: [
          {
            arquivo: "luz/2023/conta-luz-202310.jpeg",
            competencia: "2023-10",
            dataPagamento: "2023-10-09",
            valorRecibo: 15000,
            tipoMime: "image/jpeg",
          },
        ],
      }),
    )

    expect(m[0].flags).toContain("sem-planilha")
    expect(m[0].revisar).toBe(true)
  })

  it("test_linha_pendente_nao_entra_no_manifesto", () => {
    const m = construirManifesto(
      entrada({
        planilha: [{ competencia: "2026-07", valorCentavos: 0, status: "Pendente" }],
      }),
    )

    expect(m).toHaveLength(0)
  })
})

describe("lerNomeRecibo (Seam 1 — nome do arquivo → conta + competência)", () => {
  it("test_le_slug_da_pasta_e_competencia_do_sufixo", () => {
    expect(lerNomeRecibo("gas/2024/gas-202403.jpeg")).toEqual({
      contaSlug: "gas",
      competencia: "2024-03",
    })
  })

  it("test_prefixo_do_arquivo_difere_da_pasta_vale_a_pasta", () => {
    // luz guarda arquivos `conta-luz-YYYYMM`; o slug da Conta é a pasta `luz`.
    expect(lerNomeRecibo("luz/2023/conta-luz-202310.jpeg")).toEqual({
      contaSlug: "luz",
      competencia: "2023-10",
    })
  })

  it("test_aceita_pdf_e_pasta_com_hifen", () => {
    expect(lerNomeRecibo("plano-celular/2024/plano-celular-202401.pdf")).toEqual({
      contaSlug: "plano-celular",
      competencia: "2024-01",
    })
  })

  it("test_sem_competencia_no_nome_retorna_null", () => {
    expect(lerNomeRecibo("luz/2024/leia-me.txt")).toBeNull()
  })

  it("test_mes_fora_de_faixa_retorna_null", () => {
    expect(lerNomeRecibo("luz/2024/luz-202413.jpg")).toBeNull()
  })
})
