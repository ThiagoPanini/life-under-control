import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import {
  classificarValor,
  derivarMapaAno,
  ehOcorrencia,
  JANELA_MAPA_MESES,
  type MapaDoAno,
} from "./derive-mapa-ano"

/** Relógio fake in-line: devolve a data civil fixa que o teste injeta. */
const clock = (hoje: string): Clock => ({ hoje: () => hoje })
const calendar = fakeCalendar()

/** Conta base — mensal, dia-fixo 10, vigência aberta desde 2025-07; cada teste muta o que precisa. */
function conta(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    householdId: "h-1",
    nome: "Internet",
    descricao: null,
    icon: "wifi",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    primeiraCompetencia: "2025-07",
    estado: "ativa",
    encerradaEm: null,
    logoKey: null,
    ...over,
  }
}

/** Lançamento base — Conta bill-1, competência 2026-06, valor 100,00. */
function pagamento(over: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    householdId: "h-1",
    billId: "bill-1",
    valor: 10000,
    dataPagamento: "2026-06-08",
    competencia: "2026-06",
    paidBy: "p-1",
    ...over,
  }
}

/** Desembrulha as linhas, falhando o teste se o mapa veio vazio. */
function linhasDe(mapa: MapaDoAno) {
  if (mapa.estado !== "com-contas") throw new Error(`esperava com-contas, veio ${mapa.estado}`)
  return mapa
}

/** A célula da competência pedida na (primeira) linha do mapa. */
function celula(mapa: MapaDoAno, competencia: string, linha = 0) {
  const c = linhasDe(mapa).linhas[linha].celulas.find((x) => x.competencia === competencia)
  if (!c) throw new Error(`sem célula para ${competencia}`)
  return c
}

const JANELA = [
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
]

describe("derivarMapaAno (Seam 1)", () => {
  it("test_janela_de_doze_competencias_ate_a_atual", () => {
    const mapa = derivarMapaAno(clock("2026-06-15"), calendar, [conta()], [pagamento()])
    expect(linhasDe(mapa).competencias).toEqual(JANELA)
    expect(JANELA_MAPA_MESES).toBe(12)
  })

  it("test_meses_antes_da_primeira_competencia_sao_fora_da_vigencia", () => {
    // Vigência começa em 2026-01: os meses antes disso são fora-vigência, nunca "não pagos".
    const mapa = derivarMapaAno(
      clock("2026-06-15"),
      calendar,
      [conta({ primeiraCompetencia: "2026-01" })],
      [],
    )
    expect(celula(mapa, "2025-07").estado).toBe("fora-vigencia")
    expect(celula(mapa, "2025-12").estado).toBe("fora-vigencia")
    // 2026-01 já está na vigência (ocorrência mensal sem fato) — não é fora-vigência.
    expect(celula(mapa, "2026-01").estado).not.toBe("fora-vigencia")
  })

  it("test_mes_apos_encerramento_e_fora_da_vigencia", () => {
    // Encerrada em 2026-03-20 → vigência termina em 2026-03; abril em diante é fora-vigência.
    const mapa = derivarMapaAno(
      clock("2026-06-15"),
      calendar,
      [conta({ estado: "encerrada", encerradaEm: "2026-03-20" })],
      [],
    )
    expect(celula(mapa, "2026-03").estado).not.toBe("fora-vigencia")
    expect(celula(mapa, "2026-04").estado).toBe("fora-vigencia")
    expect(celula(mapa, "2026-06").estado).toBe("fora-vigencia")
  })

  it("test_encerrada_aparece_quando_vigencia_intercepta_a_janela", () => {
    // Uma encerrada cuja vigência toca a janela aparece; outra encerrada antes da
    // janela (fim < início) não aparece.
    const intercepta = conta({ id: "b-intercepta", estado: "encerrada", encerradaEm: "2025-09-30" })
    const antes = conta({
      id: "b-antes",
      primeiraCompetencia: "2024-01",
      estado: "encerrada",
      encerradaEm: "2025-05-31",
    })
    const mapa = derivarMapaAno(clock("2026-06-15"), calendar, [intercepta, antes], [])
    const ids = linhasDe(mapa).linhas.map((l) => l.billId)
    expect(ids).toContain("b-intercepta")
    expect(ids).not.toContain("b-antes")
  })

  it("test_dentro_da_vigencia_fora_da_recorrencia_e_sem_ocorrencia", () => {
    // Bimestral ancorada em junho (mês par) sem fatos: meses ímpares na vigência são
    // sem-ocorrência; um mês par é ocorrência (por-vir/vencida).
    const bimestral = conta({
      recurrence: { intervalMonths: 2, anchorMonth: 6 },
      primeiraCompetencia: "2025-07",
    })
    const mapa = derivarMapaAno(clock("2026-06-15"), calendar, [bimestral], [])
    expect(celula(mapa, "2025-09").estado).toBe("sem-ocorrencia") // ímpar → fora da recorrência
    expect(celula(mapa, "2026-01").estado).toBe("sem-ocorrencia")
    expect(["por-vir", "vencida"]).toContain(celula(mapa, "2025-08").estado) // par → ocorrência
  })

  it("test_split_soma_e_classifica_na_media_acima_e_abaixo", () => {
    // Fatos: 80 / 100(split 60+40) / 100 / 100 / 120 → média 100,00; tolerância ±5%.
    const pagos = [
      pagamento({ id: "p-fev", competencia: "2026-02", valor: 8000 }),
      pagamento({ id: "p-mar-a", competencia: "2026-03", valor: 6000 }),
      pagamento({ id: "p-mar-b", competencia: "2026-03", valor: 4000 }),
      pagamento({ id: "p-abr", competencia: "2026-04", valor: 10000 }),
      pagamento({ id: "p-mai", competencia: "2026-05", valor: 10000 }),
      pagamento({ id: "p-jun", competencia: "2026-06", valor: 12000 }),
    ]
    const mapa = derivarMapaAno(clock("2026-06-15"), calendar, [conta()], pagos)
    expect(linhasDe(mapa).linhas[0].media).toBe(10000)
    // split somado e dentro da tolerância
    expect(celula(mapa, "2026-03")).toMatchObject({ estado: "na-media", valor: 10000, desvio: 0 })
    expect(celula(mapa, "2026-06")).toMatchObject({ estado: "acima", valor: 12000, desvio: 2000 })
    expect(celula(mapa, "2026-02")).toMatchObject({ estado: "abaixo", valor: 8000, desvio: -2000 })
  })

  it("test_media_ignora_lacuna_nao_zera", () => {
    // Só dois meses com fato; a média é 100,00 (média dos fatos), não diluída por lacunas viram zero.
    const pagos = [
      pagamento({ id: "p-mai", competencia: "2026-05", valor: 10000 }),
      pagamento({ id: "p-jun", competencia: "2026-06", valor: 10000 }),
    ]
    const mapa = derivarMapaAno(clock("2026-06-15"), calendar, [conta()], pagos)
    expect(linhasDe(mapa).linhas[0].media).toBe(10000)
  })

  it("test_ocorrencia_futura_sem_fato_e_por_vir", () => {
    // Vence dia 20; hoje é 15 → ainda por vir.
    const mapa = derivarMapaAno(
      clock("2026-06-15"),
      calendar,
      [conta({ dueRule: { kind: "dia-fixo", day: 20 } })],
      [],
    )
    expect(celula(mapa, "2026-06").estado).toBe("por-vir")
  })

  it("test_ocorrencia_vencida_sem_fato_e_vencida", () => {
    // Maio venceu (dia 10) e não tem fato → vencida.
    const mapa = derivarMapaAno(clock("2026-06-15"), calendar, [conta()], [])
    expect(celula(mapa, "2026-05").estado).toBe("vencida")
  })

  it("test_sem_media_tem_representacao_explicita", () => {
    // Conta sem nenhum fato na janela: média null (ausência explícita), nenhuma célula
    // classificada como acima/abaixo/na-media.
    const mapa = derivarMapaAno(clock("2026-06-15"), calendar, [conta()], [])
    expect(linhasDe(mapa).linhas[0].media).toBeNull()
    const estados = linhasDe(mapa).linhas[0].celulas.map((c) => c.estado)
    expect(estados).not.toContain("acima")
    expect(estados).not.toContain("abaixo")
    expect(estados).not.toContain("na-media")
  })

  it("test_sem_contas_quando_nenhuma_vigencia_intercepta", () => {
    // Vigência inteira no futuro da janela → nenhuma linha → sem-contas.
    const mapa = derivarMapaAno(
      clock("2026-06-15"),
      calendar,
      [conta({ primeiraCompetencia: "2027-01" })],
      [],
    )
    expect(mapa.estado).toBe("sem-contas")
  })

  it("test_fato_fora_da_vigencia_nao_polui_a_media", () => {
    // Vigência começa em 2026-04; um Lançamento retroativo em 2026-02 (na janela, mas
    // antes do início) é oculto como fora-vigência — e NÃO pode entrar na média.
    const pagos = [
      pagamento({ id: "p-retro", competencia: "2026-02", valor: 99999 }),
      pagamento({ id: "p-mai", competencia: "2026-05", valor: 10000 }),
      pagamento({ id: "p-jun", competencia: "2026-06", valor: 10000 }),
    ]
    const mapa = derivarMapaAno(
      clock("2026-06-15"),
      calendar,
      [conta({ primeiraCompetencia: "2026-04" })],
      pagos,
    )
    // média só dos fatos dentro da vigência (10000), não diluída pelo retroativo.
    expect(linhasDe(mapa).linhas[0].media).toBe(10000)
    // a célula retroativa é fora-vigência, com valor oculto (não "não pago").
    expect(celula(mapa, "2026-02")).toMatchObject({ estado: "fora-vigencia", valor: null })
  })

  it("test_ocorrencia_que_vence_hoje_sem_fato_e_vencida", () => {
    // Vence dia 10 e hoje é dia 10 → já vencida (>=), como o farol/grid do card.
    const mapa = derivarMapaAno(clock("2026-06-10"), calendar, [conta()], [])
    expect(celula(mapa, "2026-06").estado).toBe("vencida")
  })
})

describe("classificarValor (Seam 1)", () => {
  it("test_dentro_de_5pct_e_na_media_nos_dois_extremos", () => {
    expect(classificarValor(10500, 10000)).toBe("na-media") // +5% exato
    expect(classificarValor(9500, 10000)).toBe("na-media") // -5% exato
  })
  it("test_acima_de_5pct_e_acima", () => {
    expect(classificarValor(10501, 10000)).toBe("acima")
  })
  it("test_abaixo_de_5pct_e_abaixo", () => {
    expect(classificarValor(9499, 10000)).toBe("abaixo")
  })
})

describe("ehOcorrencia (Seam 1)", () => {
  it("test_mensal_toda_competencia_e_ocorrencia", () => {
    expect(ehOcorrencia({ intervalMonths: 1, anchorMonth: null }, "2026-03")).toBe(true)
  })
  it("test_bimestral_respeita_a_ancora", () => {
    const bimestral = { intervalMonths: 2, anchorMonth: 6 } // junho e meses pares
    expect(ehOcorrencia(bimestral, "2026-06")).toBe(true)
    expect(ehOcorrencia(bimestral, "2026-08")).toBe(true)
    expect(ehOcorrencia(bimestral, "2026-07")).toBe(false)
  })
  it("test_anual_so_a_competencia_da_ancora", () => {
    const anual = { intervalMonths: 12, anchorMonth: 1 }
    expect(ehOcorrencia(anual, "2026-01")).toBe(true)
    expect(ehOcorrencia(anual, "2026-02")).toBe(false)
  })
})
