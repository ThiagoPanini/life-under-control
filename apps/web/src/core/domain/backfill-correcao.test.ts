import { describe, expect, it } from "vitest"
import type { LinhaManifesto, ReciboExtraido } from "./backfill"
import {
  diagnosticarConta,
  type EstadoContaCorrecao,
  planejarCorrecaoConta,
  planejarRenamesArquivos,
  type RegraCorrecaoConta,
  tabelaDeAdjudicacao,
} from "./backfill-correcao"

function recibo(over: Partial<ReciboExtraido> = {}): ReciboExtraido {
  return {
    arquivo: "condominio/2024/condominio-202401.jpeg",
    competencia: "2024-01",
    dataPagamento: "2024-02-08",
    valorRecibo: 60000,
    tipoMime: "image/jpeg",
    ...over,
  }
}

function linhaManifesto(over: Partial<LinhaManifesto> = {}): LinhaManifesto {
  return {
    billId: "bill-luz",
    competencia: "2024-03",
    dataPagamento: "2024-03-15",
    valor: 20390,
    valorRecibo: 20390,
    paidBy: "p-thi",
    recibo: { arquivo: "luz/2024/conta-luz-202403.jpeg", tipoMime: "image/jpeg" },
    flags: ["ok"],
    revisar: false,
    ...over,
  }
}

function regra(over: Partial<RegraCorrecaoConta> = {}): RegraCorrecaoConta {
  return {
    billId: "bill-cond",
    shift: 1,
    dueMonthOffsetAlvo: 0,
    dueRuleDayAlvo: null,
    encerrarEm: null,
    ...over,
  }
}

function estado(over: Partial<EstadoContaCorrecao> = {}): EstadoContaCorrecao {
  return {
    bill: {
      id: "bill-cond",
      dueMonthOffset: 1,
      dueRuleDay: 10,
      primeiraCompetencia: "2023-08",
      estado: "ativa",
    },
    payments: [],
    attachments: [],
    ...over,
  }
}

describe("diagnosticarConta (Seam 3 — evidência documental da defasagem)", () => {
  it("test_offset_consenso_pela_moda_entre_nome_e_vencimento_impresso", () => {
    const d = diagnosticarConta("condominio", [
      recibo({
        arquivo: "condominio/2024/condominio-202401.jpeg",
        competencia: "2024-01",
        vencimentoImpresso: "2024-02-10",
      }),
      recibo({
        arquivo: "condominio/2024/condominio-202402.jpeg",
        competencia: "2024-02",
        vencimentoImpresso: "2024-03-10",
      }),
      recibo({
        arquivo: "condominio/2024/condominio-202403.jpeg",
        competencia: "2024-03",
        vencimentoImpresso: "2024-04-10",
      }),
    ])

    expect(d.contaSlug).toBe("condominio")
    expect(d.totalRecibos).toBe(3)
    expect(d.comVencimentoImpresso).toBe(3)
    expect(d.offsetObservado).toBe(1)
    expect(d.dueDayObservado).toBe(10)
    expect(d.excecoes).toEqual([])
  })

  it("test_sem_vencimento_impresso_reporta_cobertura_zero_sem_quebrar", () => {
    const d = diagnosticarConta("luz", [
      recibo({ arquivo: "luz/2024/conta-luz-202403.jpeg", competencia: "2024-03" }),
    ])

    expect(d.totalRecibos).toBe(1)
    expect(d.comVencimentoImpresso).toBe(0)
    expect(d.offsetObservado).toBeNull()
    expect(d.dueDayObservado).toBeNull()
    expect(d.excecoes).toEqual([])
  })

  it("test_arquivo_que_contradiz_a_moda_vira_excecao", () => {
    const d = diagnosticarConta("gas", [
      recibo({
        arquivo: "gas/2024/gas-202401.jpeg",
        competencia: "2024-01",
        vencimentoImpresso: "2024-02-15",
      }),
      recibo({
        arquivo: "gas/2024/gas-202402.jpeg",
        competencia: "2024-02",
        vencimentoImpresso: "2024-03-15",
      }),
      recibo({
        arquivo: "gas/2024/gas-202403.jpeg",
        competencia: "2024-03",
        vencimentoImpresso: "2024-03-15",
        mesReferenciaImpresso: "2024-03",
      }),
    ])

    expect(d.offsetObservado).toBe(1)
    expect(d.excecoes).toEqual([
      {
        arquivo: "gas/2024/gas-202403.jpeg",
        offsetDoArquivo: 0,
        vencimentoImpresso: "2024-03-15",
        mesReferenciaImpresso: "2024-03",
      },
    ])
  })

  it("test_empate_de_moda_fica_no_offset_de_menor_valor_absoluto", () => {
    const d = diagnosticarConta("gas", [
      recibo({
        arquivo: "gas/2024/gas-202401.jpeg",
        competencia: "2024-01",
        vencimentoImpresso: "2024-01-15",
      }),
      recibo({
        arquivo: "gas/2024/gas-202402.jpeg",
        competencia: "2024-02",
        vencimentoImpresso: "2024-03-15",
      }),
    ])

    expect(d.offsetObservado).toBe(0)
  })

  it("test_due_day_observado_e_a_moda_dos_dias_impressos", () => {
    const d = diagnosticarConta("internet", [
      recibo({
        arquivo: "internet/2024/internet-202401.jpeg",
        competencia: "2024-01",
        vencimentoImpresso: "2024-01-27",
      }),
      recibo({
        arquivo: "internet/2024/internet-202402.jpeg",
        competencia: "2024-02",
        vencimentoImpresso: "2024-02-27",
      }),
      recibo({
        arquivo: "internet/2024/internet-202403.jpeg",
        competencia: "2024-03",
        vencimentoImpresso: "2024-03-26",
      }),
    ])

    expect(d.dueDayObservado).toBe(27)
  })
})

describe("tabelaDeAdjudicacao (Seam 3 — exceções que pedem o operador)", () => {
  it("test_so_linhas_de_revisao_entram_na_tabela_com_ambos_os_valores", () => {
    const tabela = tabelaDeAdjudicacao([
      linhaManifesto(),
      linhaManifesto({
        competencia: "2024-05",
        valor: 20000,
        valorRecibo: 25000,
        flags: ["valor-divergente"],
        revisar: true,
      }),
      linhaManifesto({
        competencia: "2023-10",
        valor: 15000,
        valorRecibo: 15000,
        flags: ["sem-planilha"],
        revisar: true,
      }),
    ])

    expect(tabela).toHaveLength(2)
    expect(tabela[0]).toMatchObject({
      billId: "bill-luz",
      competencia: "2024-05",
      motivo: "valor-divergente",
      valorPlanilha: 20000,
      valorRecibo: 25000,
    })
    expect(tabela[1]).toMatchObject({ competencia: "2023-10", motivo: "sem-planilha" })
    expect(tabela[0].arquivo).toContain("conta-luz")
  })
})

describe("planejarCorrecaoConta (Seam 3 — plano de correção idempotente)", () => {
  it("test_conta_defasada_gera_plano_completo_de_shift", () => {
    const plano = planejarCorrecaoConta(
      regra(),
      estado({
        payments: [
          { id: "p1", competencia: "2023-08" },
          { id: "p2", competencia: "2023-09" },
          { id: "p3", competencia: "2023-12" },
        ],
        attachments: [{ id: "a1", paymentId: "p1", nomeOriginal: "condominio-202308.jpeg" }],
      }),
      ["2023-09", "2023-10", "2024-01"],
    )

    expect(plano.situacao).toBe("pendente")
    expect(plano.paymentUpdates).toHaveLength(3)
    expect(plano.paymentUpdates).toContainEqual({ paymentId: "p1", de: "2023-08", para: "2023-09" })
    expect(plano.paymentUpdates).toContainEqual({ paymentId: "p3", de: "2023-12", para: "2024-01" })
    expect(plano.billUpdate).toEqual({ dueMonthOffset: 0, primeiraCompetencia: "2023-09" })
    expect(plano.attachmentRenames).toEqual([
      { attachmentId: "a1", de: "condominio-202308.jpeg", para: "condominio-202309.jpeg" },
    ])
    expect(plano.encerramento).toBeNull()
    expect(plano.avisos).toEqual([])
  })

  it("test_estado_ja_corrigido_gera_plano_vazio", () => {
    const plano = planejarCorrecaoConta(
      regra(),
      estado({
        bill: {
          id: "bill-cond",
          dueMonthOffset: 0,
          dueRuleDay: 10,
          primeiraCompetencia: "2023-09",
          estado: "ativa",
        },
        payments: [
          { id: "p1", competencia: "2023-09" },
          { id: "p2", competencia: "2023-10" },
        ],
        attachments: [{ id: "a1", paymentId: "p1", nomeOriginal: "condominio-202309.jpeg" }],
      }),
      ["2023-09", "2023-10"],
    )

    expect(plano.situacao).toBe("corrigida")
    expect(plano.paymentUpdates).toEqual([])
    expect(plano.billUpdate).toBeNull()
    expect(plano.attachmentRenames).toEqual([])
    expect(plano.encerramento).toBeNull()
  })

  it("test_conjunto_incompativel_com_a_verdade_e_inconsistente_e_nao_toca", () => {
    const plano = planejarCorrecaoConta(
      regra(),
      estado({
        payments: [
          { id: "p1", competencia: "2023-08" },
          { id: "p2", competencia: "2023-11" },
        ],
      }),
      ["2023-09", "2023-10"],
    )

    expect(plano.situacao).toBe("inconsistente")
    expect(plano.paymentUpdates).toEqual([])
    expect(plano.billUpdate).toBeNull()
    expect(plano.attachmentRenames).toEqual([])
    expect(plano.avisos.length).toBeGreaterThan(0)
  })

  it("test_competencia_duplicada_na_conta_e_inconsistente", () => {
    const plano = planejarCorrecaoConta(
      regra(),
      estado({
        payments: [
          { id: "p1", competencia: "2023-08" },
          { id: "p2", competencia: "2023-08" },
        ],
      }),
      ["2023-09"],
    )

    expect(plano.situacao).toBe("inconsistente")
    expect(plano.paymentUpdates).toEqual([])
  })

  it("test_due_day_alvo_diferente_atualiza_a_regra_de_vencimento", () => {
    const plano = planejarCorrecaoConta(
      regra({ billId: "bill-net", shift: 0, dueRuleDayAlvo: 27 }),
      estado({
        bill: {
          id: "bill-net",
          dueMonthOffset: 0,
          dueRuleDay: 20,
          primeiraCompetencia: "2023-11",
          estado: "ativa",
        },
        payments: [{ id: "p1", competencia: "2023-11" }],
      }),
      ["2023-11"],
    )

    expect(plano.situacao).toBe("pendente")
    expect(plano.paymentUpdates).toEqual([])
    expect(plano.billUpdate).toEqual({ dueRuleDay: 27 })
  })

  it("test_encerramento_so_sai_para_conta_ativa", () => {
    const ativa = planejarCorrecaoConta(
      regra({ billId: "bill-das", shift: 0, encerrarEm: "2025-10-31" }),
      estado({
        bill: {
          id: "bill-das",
          dueMonthOffset: 0,
          dueRuleDay: 20,
          primeiraCompetencia: "2025-10",
          estado: "ativa",
        },
        payments: [{ id: "p1", competencia: "2025-10" }],
      }),
      ["2025-10"],
    )
    expect(ativa.situacao).toBe("pendente")
    expect(ativa.encerramento).toEqual({ encerradaEm: "2025-10-31" })

    const encerrada = planejarCorrecaoConta(
      regra({ billId: "bill-das", shift: 0, encerrarEm: "2025-10-31" }),
      estado({
        bill: {
          id: "bill-das",
          dueMonthOffset: 0,
          dueRuleDay: 20,
          primeiraCompetencia: "2025-10",
          estado: "encerrada",
        },
        payments: [{ id: "p1", competencia: "2025-10" }],
      }),
      ["2025-10"],
    )
    expect(encerrada.situacao).toBe("corrigida")
    expect(encerrada.encerramento).toBeNull()
  })

  it("test_anexo_sem_sufixo_de_competencia_gera_aviso_e_nao_renomeia", () => {
    const plano = planejarCorrecaoConta(
      regra(),
      estado({
        payments: [{ id: "p1", competencia: "2023-08" }],
        attachments: [{ id: "a1", paymentId: "p1", nomeOriginal: "recibo-avulso.pdf" }],
      }),
      ["2023-09"],
    )

    expect(plano.attachmentRenames).toEqual([])
    expect(plano.avisos.length).toBeGreaterThan(0)
  })
})

describe("planejarRenamesArquivos (Seam 3 — tmp/ renomeado para a verdade)", () => {
  it("test_renomeia_sufixo_e_diretorio_do_ano_na_virada", () => {
    const renames = planejarRenamesArquivos(["condominio/2024/condominio-202412.jpeg"], 1, false)

    expect(renames).toEqual([
      {
        de: "condominio/2024/condominio-202412.jpeg",
        para: "condominio/2025/condominio-202501.jpeg",
      },
    ])
  })

  it("test_prefixo_arbitrario_do_arquivo_e_preservado", () => {
    const renames = planejarRenamesArquivos(["luz/2023/conta-luz-202310.jpeg"], 1, false)

    expect(renames).toEqual([
      { de: "luz/2023/conta-luz-202310.jpeg", para: "luz/2023/conta-luz-202311.jpeg" },
    ])
  })

  it("test_raiz_corrigida_nao_renomeia_nada", () => {
    expect(planejarRenamesArquivos(["condominio/2024/condominio-202401.jpeg"], 1, true)).toEqual([])
  })

  it("test_offset_zero_nao_renomeia_nada", () => {
    expect(planejarRenamesArquivos(["luz/2023/conta-luz-202310.jpeg"], 0, false)).toEqual([])
  })
})
