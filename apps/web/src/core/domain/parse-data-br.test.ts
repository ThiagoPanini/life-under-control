import { describe, expect, it } from "vitest"
import { parseDataBrParaIso } from "./parse-data-br"

/**
 * Parser da data de pagamento digitada pelo casal no chat (#178): dd/mm[/aaaa] em
 * pt-BR → ISO (YYYY-MM-DD), ou `null` quando não é data real. Data de comprovante é
 * sempre passada — sem ano, pega a ocorrência passada mais recente (recua ano a ano
 * do de hoje, cobrindo a virada e o 29/02). Puro, sem relógio: `hoje` é injetado.
 */
const HOJE = "2026-07-08"

describe("parseDataBrParaIso", () => {
  it("test_dia_mes_ano_completo_vira_iso", () => {
    expect(parseDataBrParaIso("05/07/2026", HOJE)).toBe("2026-07-05")
  })

  it("test_um_digito_em_dia_e_mes_normaliza_com_zero", () => {
    expect(parseDataBrParaIso("5/7/2026", HOJE)).toBe("2026-07-05")
  })

  it("test_sem_ano_infere_o_ano_de_hoje", () => {
    expect(parseDataBrParaIso("05/07", HOJE)).toBe("2026-07-05")
  })

  it("test_sem_ano_que_cairia_no_futuro_recua_um_ano", () => {
    // Hoje 08/01/2026; comprovante de 31/12 é do ano passado (pagamento é fato
    // passado — nunca futuro).
    expect(parseDataBrParaIso("31/12", "2026-01-08")).toBe("2025-12-31")
  })

  it("test_ano_de_dois_digitos_assume_2000", () => {
    expect(parseDataBrParaIso("05/07/26", HOJE)).toBe("2026-07-05")
  })

  it("test_data_impossivel_no_mes_curto_devolve_null", () => {
    // 31 de abril não existe — data ISO real (não só o formato).
    expect(parseDataBrParaIso("31/04/2026", HOJE)).toBeNull()
  })

  it("test_29_de_fevereiro_em_ano_nao_bissexto_devolve_null", () => {
    expect(parseDataBrParaIso("29/02/2025", HOJE)).toBeNull()
  })

  it("test_29_de_fevereiro_em_ano_bissexto_vale", () => {
    expect(parseDataBrParaIso("29/02/2024", HOJE)).toBe("2024-02-29")
  })

  it("test_29_de_fevereiro_sem_ano_recua_ate_o_bissexto_anterior", () => {
    // Hoje em 2026 (não-bissexto): "29/02" não existe em 2026 nem 2025 — a ocorrência
    // passada mais recente é 2024. O parser recua ano a ano até casar uma data real.
    expect(parseDataBrParaIso("29/02", HOJE)).toBe("2024-02-29")
  })

  it("test_sem_ano_no_mesmo_dia_de_hoje_vale_hoje", () => {
    // Limite: hoje não é futuro — a ocorrência do próprio dia é aceita.
    expect(parseDataBrParaIso("08/07", HOJE)).toBe("2026-07-08")
  })

  it("test_lixo_e_formato_errado_devolvem_null", () => {
    expect(parseDataBrParaIso("ontem", HOJE)).toBeNull()
    expect(parseDataBrParaIso("2026-07-05", HOJE)).toBeNull()
    expect(parseDataBrParaIso("05-07-2026", HOJE)).toBeNull()
    expect(parseDataBrParaIso("", HOJE)).toBeNull()
    expect(parseDataBrParaIso("13/13/2026", HOJE)).toBeNull()
  })
})
