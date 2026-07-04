import { describe, expect, it } from "vitest"
import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Clock } from "@/core/ports/clock"
import { fakeCalendar } from "./calendar.fake"
import { derivarAgenda } from "./derive-agenda"

const clock = (hoje: string): Clock => ({ hoje: () => hoje })

/** Conta mensal, dia-fixo 10, sem offset — base que cada teste muta. */
function billBase(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    householdId: "h-1",
    nome: "Luz",
    descricao: null,
    icon: "zap",
    recurrence: { intervalMonths: 1, anchorMonth: null },
    dueRule: { kind: "dia-fixo", day: 10 },
    dueMonthOffset: 0,
    primeiraCompetencia: "2020-01",
    estado: "ativa",
    encerradaEm: null,
    logoKey: null,
    ...over,
  }
}

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

describe("derivarAgenda (Seam 1)", () => {
  const cal = fakeCalendar()

  it("test_ocorrencia_em_aberto_entra_no_grupo_atrasado_com_nota_e_tom_warn", () => {
    const grupos = derivarAgenda(clock("2026-06-12"), cal, [billBase()], [])
    expect(grupos[0]).toMatchObject({
      titulo: "Atrasado",
      nota: "venceu ou vence hoje, sem Lançamento",
      tone: "warn",
    })
  })

  it("test_grupo_atrasado_vem_sempre_antes_dos_meses_futuros", () => {
    const grupos = derivarAgenda(clock("2026-06-12"), cal, [billBase()], [])
    expect(grupos.map((g) => g.titulo)).toEqual(["Atrasado", "Julho de 2026"])
  })

  it("test_grupos_de_mes_futuro_tem_nota_projecoes_das_contas", () => {
    const grupos = derivarAgenda(clock("2026-06-05"), cal, [billBase()], [])
    expect(grupos.find((g) => g.titulo === "Julho de 2026")).toMatchObject({
      nota: "projeções das Contas",
      tone: "default",
    })
  })

  it("test_vence_hoje_entra_no_atrasado_com_frase_vence_hoje", () => {
    // a nota do grupo cobre "venceu ou vence hoje" — não pode contradizer a
    // frase da própria linha quando o vencimento é hoje.
    const grupos = derivarAgenda(clock("2026-06-10"), cal, [billBase()], [])
    expect(grupos[0].titulo).toBe("Atrasado")
    expect(grupos[0].itens[0]).toMatchObject({ vencimento: "2026-06-10", frase: "vence hoje" })
  })

  it("test_sem_ocorrencias_vencidas_nao_cria_grupo_atrasado", () => {
    const grupos = derivarAgenda(clock("2026-06-05"), cal, [billBase()], [])
    expect(grupos.map((g) => g.titulo)).not.toContain("Atrasado")
  })

  it("test_item_carrega_farol_e_frase_da_leitura_de_estado_62", () => {
    const grupos = derivarAgenda(clock("2026-06-12"), cal, [billBase()], [])
    expect(grupos[0].itens[0]).toMatchObject({ farol: "vermelho", frase: "venceu há 2 dias" })
  })

  it("test_item_carrega_assunto_da_conta", () => {
    const grupos = derivarAgenda(clock("2026-06-12"), cal, [billBase()], [])
    expect(grupos[0].itens[0].assunto).toBe("Pagamentos Recorrentes")
  })

  it("test_valor_estimado_e_a_media_historica_ate_a_competencia", () => {
    const pagos = [
      pagamento({ competencia: "2026-04" }),
      pagamento({ competencia: "2026-05", valor: 12000 }),
    ]
    const grupos = derivarAgenda(clock("2026-06-12"), cal, [billBase()], pagos)
    expect(grupos[0].itens[0].valorEstimado).toBe(11000)
  })

  it("test_sem_historico_valor_estimado_e_null", () => {
    const grupos = derivarAgenda(clock("2026-06-12"), cal, [billBase()], [])
    expect(grupos[0].itens[0].valorEstimado).toBeNull()
  })

  it("test_ocorrencia_paga_nao_aparece_em_grupo_algum", () => {
    const pagos = [pagamento({ competencia: "2026-06" })]
    const grupos = derivarAgenda(clock("2026-06-05"), cal, [billBase()], pagos)
    const competencias = grupos.flatMap((g) => g.itens.map((i) => i.competencia))
    expect(competencias).not.toContain("2026-06")
  })

  it("test_sem_contas_ativas_agenda_sem_grupos", () => {
    expect(derivarAgenda(clock("2026-06-05"), cal, [], [])).toEqual([])
  })
})
