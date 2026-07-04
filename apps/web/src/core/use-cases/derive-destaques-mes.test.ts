import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import {
  type DestaquesMes,
  derivarDestaquesMes,
  type MaiorLancamento,
  type VariacaoConta,
} from "./derive-destaques-mes"

/** Relógio fake in-line: devolve a data civil fixa que o teste injeta. */
const clock = (hoje: string): Clock => ({ hoje: () => hoje })

/** Lançamento base — competência 2026-05, valor 100,00; cada teste muta o que precisa. */
function pagamento(over: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    householdId: "h-1",
    billId: "bill-1",
    valor: 10000,
    dataPagamento: "2026-05-08",
    competencia: "2026-05",
    paidBy: "p-1",
    ...over,
  }
}

/** Conta base — `bill-1` "Energia", ativa; cada teste muta id/nome/estado. */
function conta(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    householdId: "h-1",
    nome: "Energia",
    descricao: null,
    icon: "zap",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    estado: "ativa",
    encerradaEm: null,
    logoKey: null,
    ...over,
  }
}

/** Desembrulha uma variação, falhando se veio insuficiente. */
function variacaoOk(v: VariacaoConta) {
  if (v.estado !== "ok") throw new Error(`esperava ok, veio ${v.estado}`)
  return v
}

/** Desembrulha o maior Lançamento, falhando se veio insuficiente. */
function lancamentoOk(l: MaiorLancamento) {
  if (l.estado !== "ok") throw new Error(`esperava ok, veio ${l.estado}`)
  return l
}

// Frame de referência de todos os testes: hoje 2026-06-15 → mês corrente 2026-06
// (parcial, ignorado); mês fechado = 2026-05; mês-base = 2026-04.
describe("derivarDestaquesMes (Seam 1)", () => {
  it("test_ignora_mes_atual_parcial_e_compara_dois_ultimos_fechados", () => {
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [
        pagamento({ id: "b", competencia: "2026-04", valor: 1000 }),
        pagamento({ id: "f", competencia: "2026-05", valor: 3000 }),
        // Fato gigante no mês corrente parcial — não pode entrar em nenhuma métrica.
        pagamento({ id: "atual", competencia: "2026-06", valor: 999999 }),
      ],
    )
    expect(d.competenciaCorrente).toBe("2026-06")
    expect(d.competenciaBase).toBe("2026-04")
    expect(d.competenciaFechada).toBe("2026-05")
    const alta = variacaoOk(d.maiorAlta)
    expect(alta).toMatchObject({ billId: "bill-1", base: 1000, atual: 3000, delta: 2000 })
    // O Lançamento do mês corrente não vira o "maior".
    expect(lancamentoOk(d.maiorLancamento).valor).toBe(3000)
  })

  it("test_alta_agrega_splits_por_conta_antes_da_variacao", () => {
    // Baixa partida no mês fechado: dois Lançamentos da mesma Conta somam antes da variação.
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [
        pagamento({ id: "b", competencia: "2026-04", valor: 1000 }),
        pagamento({ id: "f1", competencia: "2026-05", valor: 1500 }),
        pagamento({ id: "f2", competencia: "2026-05", valor: 1500 }),
      ],
    )
    const alta = variacaoOk(d.maiorAlta)
    expect(alta).toMatchObject({ atual: 3000, base: 1000, delta: 2000, percentual: 200 })
  })

  it("test_conta_nova_sem_base_nao_concorre_a_alta", () => {
    // Conta nasce no mês fechado: sem base positiva não há variação calculável —
    // não vira "+100%" artificial (CONTEXT.md #6). Única Conta → alta insuficiente.
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [pagamento({ id: "f", competencia: "2026-05", valor: 5000 })],
    )
    expect(d.maiorAlta).toEqual({ estado: "insuficiente" })
    expect(d.maiorQueda).toEqual({ estado: "insuficiente" })
    // Mas o fato existe e é o maior Lançamento do mês fechado.
    expect(lancamentoOk(d.maiorLancamento).valor).toBe(5000)
  })

  it("test_percentual_calculado_quando_base_positiva", () => {
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [
        pagamento({ id: "b", competencia: "2026-04", valor: 2000 }),
        pagamento({ id: "f", competencia: "2026-05", valor: 3000 }),
      ],
    )
    expect(variacaoOk(d.maiorAlta).percentual).toBe(50)
  })

  it("test_maior_alta_seleciona_maior_variacao_positiva_e_identifica_conta", () => {
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta({ id: "bill-1", nome: "Energia" }), conta({ id: "bill-2", nome: "Internet" })],
      [
        pagamento({ id: "b1", billId: "bill-1", competencia: "2026-04", valor: 1000 }),
        pagamento({ id: "f1", billId: "bill-1", competencia: "2026-05", valor: 2000 }),
        pagamento({ id: "b2", billId: "bill-2", competencia: "2026-04", valor: 1000 }),
        pagamento({ id: "f2", billId: "bill-2", competencia: "2026-05", valor: 4000 }),
      ],
    )
    const alta = variacaoOk(d.maiorAlta)
    expect(alta).toMatchObject({ billId: "bill-2", nome: "Internet", delta: 3000, percentual: 300 })
  })

  it("test_maior_queda_seleciona_maior_variacao_negativa_e_identifica_conta", () => {
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta({ id: "bill-1", nome: "Energia" }), conta({ id: "bill-2", nome: "Internet" })],
      [
        pagamento({ id: "b1", billId: "bill-1", competencia: "2026-04", valor: 5000 }),
        pagamento({ id: "f1", billId: "bill-1", competencia: "2026-05", valor: 3000 }),
        pagamento({ id: "b2", billId: "bill-2", competencia: "2026-04", valor: 8000 }),
        pagamento({ id: "f2", billId: "bill-2", competencia: "2026-05", valor: 3000 }),
      ],
    )
    const queda = variacaoOk(d.maiorQueda)
    expect(queda).toMatchObject({
      billId: "bill-2",
      nome: "Internet",
      delta: -5000,
      percentual: -62.5,
    })
  })

  it("test_conta_que_some_no_mes_fechado_nao_concorre_a_queda", () => {
    // Presente no base, ausente no fechado: sem o par dos dois meses não há
    // variação mês-a-mês — a Conta não concorre à queda (não é "-100%" fabricado).
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [pagamento({ id: "b", competencia: "2026-04", valor: 4000 })],
    )
    expect(d.maiorQueda).toEqual({ estado: "insuficiente" })
    expect(d.maiorAlta).toEqual({ estado: "insuficiente" })
  })

  it("test_maior_lancamento_usa_fato_individual_nao_agregado_da_conta", () => {
    // Conta A agrega 6000 (dois de 3000); Conta B tem um único de 5000.
    // O maior agregado é A, mas o maior FATO individual é o de B (5000).
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta({ id: "bill-1", nome: "Energia" }), conta({ id: "bill-2", nome: "Internet" })],
      [
        pagamento({ id: "a1", billId: "bill-1", competencia: "2026-05", valor: 3000 }),
        pagamento({ id: "a2", billId: "bill-1", competencia: "2026-05", valor: 3000 }),
        pagamento({ id: "b1", billId: "bill-2", competencia: "2026-05", valor: 5000 }),
      ],
    )
    const maior = lancamentoOk(d.maiorLancamento)
    expect(maior).toMatchObject({
      paymentId: "b1",
      billId: "bill-2",
      nome: "Internet",
      valor: 5000,
    })
  })

  it("test_maior_lancamento_e_do_mes_fechado_nao_do_base", () => {
    // Fato gigante no mês-base não pode ganhar: o destaque é do último mês fechado.
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [
        pagamento({ id: "base-grande", competencia: "2026-04", valor: 99999 }),
        pagamento({ id: "fechado", competencia: "2026-05", valor: 5000 }),
      ],
    )
    const maior = lancamentoOk(d.maiorLancamento)
    expect(maior).toMatchObject({ paymentId: "fechado", competencia: "2026-05", valor: 5000 })
  })

  it("test_empate_de_delta_desempata_por_billId_crescente", () => {
    // Mesma variação; o desempate determinístico escolhe o menor billId.
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta({ id: "bill-b", nome: "Beta" }), conta({ id: "bill-a", nome: "Alfa" })],
      [
        pagamento({ id: "ba", billId: "bill-a", competencia: "2026-04", valor: 1000 }),
        pagamento({ id: "fa", billId: "bill-a", competencia: "2026-05", valor: 3000 }),
        pagamento({ id: "bb", billId: "bill-b", competencia: "2026-04", valor: 1000 }),
        pagamento({ id: "fb", billId: "bill-b", competencia: "2026-05", valor: 3000 }),
      ],
    )
    expect(variacaoOk(d.maiorAlta).billId).toBe("bill-a")
  })

  it("test_conta_encerrada_entra_na_comparacao_com_nome_resolvido", () => {
    // Fatos de uma Conta hoje encerrada ainda contam e o nome é resolvido.
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta({ id: "bill-1", nome: "Netflix", estado: "encerrada", encerradaEm: "2026-05-31" })],
      [
        pagamento({ id: "b", competencia: "2026-04", valor: 1000 }),
        pagamento({ id: "f", competencia: "2026-05", valor: 4000 }),
      ],
    )
    expect(variacaoOk(d.maiorAlta)).toMatchObject({
      billId: "bill-1",
      nome: "Netflix",
      delta: 3000,
    })
  })

  it("test_sem_variacao_positiva_a_alta_vira_insuficiente_por_metrica", () => {
    // Só quedas na janela: a queda existe, mas a alta não tem candidato.
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [
        pagamento({ id: "b", competencia: "2026-04", valor: 5000 }),
        pagamento({ id: "f", competencia: "2026-05", valor: 2000 }),
      ],
    )
    expect(d.maiorAlta).toEqual({ estado: "insuficiente" })
    expect(variacaoOk(d.maiorQueda).delta).toBe(-3000)
  })

  it("test_sem_fatos_nos_meses_comparados_todas_as_metricas_insuficientes", () => {
    // Nada nos dois meses fechados (só o parcial) → cada métrica é histórico insuficiente.
    const d = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [pagamento({ id: "atual", competencia: "2026-06", valor: 9000 })],
    )
    expect(d.competenciaBase).toBe("2026-04")
    expect(d.competenciaFechada).toBe("2026-05")
    expect(d.maiorAlta).toEqual({ estado: "insuficiente" })
    expect(d.maiorQueda).toEqual({ estado: "insuficiente" })
    expect(d.maiorLancamento).toEqual({ estado: "insuficiente" })
  })

  it("test_mes_base_ausente_deixa_variacoes_insuficientes_mas_mantem_maior_lancamento", () => {
    // Mês-base sem nenhum fato: nenhuma Conta tem base para comparar → sem alta nem
    // queda; mas o maior Lançamento do mês fechado continua sendo um destaque.
    const d: DestaquesMes = derivarDestaquesMes(
      clock("2026-06-15"),
      [conta()],
      [pagamento({ id: "f", competencia: "2026-05", valor: 5000 })],
    )
    expect(d.maiorAlta).toEqual({ estado: "insuficiente" })
    expect(d.maiorQueda).toEqual({ estado: "insuficiente" })
    expect(lancamentoOk(d.maiorLancamento)).toMatchObject({ valor: 5000, competencia: "2026-05" })
  })
})
