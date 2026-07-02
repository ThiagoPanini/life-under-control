import { describe, expect, it } from "vitest"
import type { Recurrence } from "@/core/domain/bill"
import {
  farolDaOcorrencia,
  fraseDaOcorrencia,
  leituraLongaDaOcorrencia,
  type Ocorrencia,
  ordenarPorUrgencia,
} from "./derive-estado-ocorrencia"

const mensal: Recurrence = { intervalMonths: 1, anchorMonth: null }

function ocorrenciaBase(over: Partial<Ocorrencia> = {}): Ocorrencia {
  return {
    vencimento: "2026-07-10",
    competencia: "2026-07",
    recurrence: mensal,
    quitada: false,
    ...over,
  }
}

describe("farolDaOcorrencia (Seam 1)", () => {
  it("test_farol_vermelho_quando_vencida_ou_vence_hoje", () => {
    expect(farolDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-02" }), "2026-07-10")).toBe(
      "vermelho",
    )
    expect(farolDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-10" }), "2026-07-10")).toBe(
      "vermelho",
    )
  })

  it("test_farol_amarelo_no_limiar_3_dias", () => {
    expect(farolDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-13" }), "2026-07-10")).toBe(
      "amarelo",
    )
    expect(farolDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-14" }), "2026-07-10")).toBe(
      "cinza",
    )
  })

  it("test_farol_verde_quando_quitada_mesmo_vencida", () => {
    expect(
      farolDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-02", quitada: true }), "2026-07-10"),
    ).toBe("verde")
  })
})

describe("fraseDaOcorrencia (Seam 1)", () => {
  it("test_frase_por_farol_e_proximidade", () => {
    expect(fraseDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-02" }), "2026-07-10")).toBe(
      "venceu há 8 dias",
    )
    expect(fraseDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-10" }), "2026-07-10")).toBe(
      "vence hoje",
    )
    expect(fraseDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-12" }), "2026-07-10")).toBe(
      "vence em 2 dias",
    )
    expect(fraseDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-24" }), "2026-07-10")).toBe(
      "em 14 dias",
    )
  })

  it("test_frase_singular_para_1_dia", () => {
    expect(fraseDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-09" }), "2026-07-10")).toBe(
      "venceu há 1 dia",
    )
    expect(fraseDaOcorrencia(ocorrenciaBase({ vencimento: "2026-07-11" }), "2026-07-10")).toBe(
      "vence em 1 dia",
    )
  })

  it("test_quitada_frase_com_competencia", () => {
    expect(
      fraseDaOcorrencia(ocorrenciaBase({ quitada: true, competencia: "2026-07" }), "2026-07-10"),
    ).toBe("quitada · Julho/2026")

    const anual: Recurrence = { intervalMonths: 12, anchorMonth: 7 }
    expect(
      fraseDaOcorrencia(
        ocorrenciaBase({ quitada: true, competencia: "2026-07", recurrence: anual }),
        "2026-07-10",
      ),
    ).toBe("quitada · 2026")
  })
})

describe("leituraLongaDaOcorrencia (Seam 1)", () => {
  it("test_leitura_longa_vencida_com_data", () => {
    expect(
      leituraLongaDaOcorrencia(
        ocorrenciaBase({ competencia: "2026-06", vencimento: "2026-06-28" }),
        "2026-07-01",
      ),
    ).toBe("competência de junho sem Lançamento — venceu 28/06/2026")
  })

  it("test_leitura_longa_vence_hoje", () => {
    expect(
      leituraLongaDaOcorrencia(
        ocorrenciaBase({ competencia: "2026-07", vencimento: "2026-07-10" }),
        "2026-07-10",
      ),
    ).toBe("competência de julho sem Lançamento — vence hoje")
  })

  it("test_leitura_longa_vence_no_futuro", () => {
    expect(
      leituraLongaDaOcorrencia(
        ocorrenciaBase({ competencia: "2026-07", vencimento: "2026-07-20" }),
        "2026-07-10",
      ),
    ).toBe("competência de julho sem Lançamento — vence 20/07/2026")
  })

  it("test_leitura_longa_quitada_nao_menciona_vencimento", () => {
    expect(
      leituraLongaDaOcorrencia(
        ocorrenciaBase({ competencia: "2026-06", vencimento: "2026-06-28", quitada: true }),
        "2026-07-01",
      ),
    ).toBe("competência de junho quitada")
  })
})

describe("ordenarPorUrgencia (Seam 1)", () => {
  it("test_ordenacao_vermelho_amarelo_cinza_verde_depois_proximidade", () => {
    const hoje = "2026-07-10"
    const verde = ocorrenciaBase({ competencia: "verde", quitada: true })
    const cinzaLonge = ocorrenciaBase({ competencia: "cinza-longe", vencimento: "2026-07-30" })
    const cinzaPerto = ocorrenciaBase({ competencia: "cinza-perto", vencimento: "2026-07-20" })
    const amarelo = ocorrenciaBase({ competencia: "amarelo", vencimento: "2026-07-12" })
    const vermelhoLeve = ocorrenciaBase({ competencia: "vermelho-leve", vencimento: "2026-07-09" })
    const vermelhoForte = ocorrenciaBase({
      competencia: "vermelho-forte",
      vencimento: "2026-06-20",
    })

    const ordenado = ordenarPorUrgencia(
      [cinzaLonge, verde, amarelo, vermelhoLeve, cinzaPerto, vermelhoForte],
      hoje,
    )

    expect(ordenado.map((o) => o.competencia)).toEqual([
      "vermelho-forte",
      "vermelho-leve",
      "amarelo",
      "cinza-perto",
      "cinza-longe",
      "verde",
    ])
  })
})
