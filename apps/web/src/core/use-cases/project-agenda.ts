import type { Bill } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import { addMeses, mesDe, ocorrenciasRecentes, resolverVencimento } from "./derive-bill-card"

/**
 * **Agenda** (issue #23): a projeção das Contas ativas como **vista pura** — não
 * guarda dado próprio (invariante #7); some se as Contas sumirem. Lista as
 * ocorrências **não pagas** do **mês vigente + próximo** ("~45 dias"), cada uma
 * com seu vencimento esperado e nada de valor (invariante #5: projeta o "quando",
 * jamais o "quanto"). O que foi pago sai da Agenda. Tudo deriva de Contas +
 * Lançamentos + `Clock` + `Calendar` (invariante #3), reusando `resolverVencimento`
 * do card da Conta (#21).
 *
 * A estrutura nasce **agnóstica de Área** (ADR-0006): `ItemAgenda` não fala de
 * Conta, e sim de um Gerador (`geradorId`) numa Área (`area`) — as próximas Áreas
 * plugam a mesma forma. Hoje só Finanças alimenta a projeção.
 *
 * **Escopo da janela.** Ancorada na **ocorrência corrente** de cada Conta — a
 * mesma que o farol do card olha (`ocorrenciasRecentes(…, 1)`) — e caminhando
 * pra frente pela periodicidade. A corrente não-paga e já vencida entra como
 * `em-aberto` (paridade com o farol vermelho, inclusive numa Conta não-mensal cuja
 * ocorrência corrente caiu meses atrás); as seguintes entram como `aguardando`
 * enquanto vencerem dentro da janela (mês vigente + próximo, "~45 dias"). O que
 * vencer além disso fica de fora. Reusa o eixo de recorrência do card em vez de
 * recalcular a fase — uma só fonte da verdade.
 */

/** Área que alimenta a Agenda. Cresce conforme as Áreas plugam (ADR-0006). */
export type AreaAgenda = "financas"

/**
 * Um item da Agenda: uma ocorrência não-paga, **sem valor** (invariante #5).
 * Clicável: `(area, geradorId, competencia)` aponta a baixa daquela ocorrência.
 */
export type ItemAgenda = {
  /** A Área dona da ocorrência — discrimina o destino do clique. */
  area: AreaAgenda
  /** Id do Gerador de origem (a Conta, em Finanças) — o "o quê" do clique (ADR-0005). */
  geradorId: string
  /** Competência da ocorrência (`YYYY-MM`) — o "quando" do clique. */
  competencia: string
  /** Rótulo exibido ("Netflix"). */
  titulo: string
  /** Vencimento esperado (`YYYY-MM-DD`) — a chave de ordenação no tempo. */
  vencimento: string
  /** Não-paga: já venceu/vence hoje (`em-aberto`) ou ainda vai vencer (`aguardando`). */
  estado: "em-aberto" | "aguardando"
}

/**
 * Projeta a Agenda: para cada Conta **ativa**, as ocorrências não-pagas a partir
 * da corrente até o fim da janela (mês vigente + próximo), ordenadas pelo
 * vencimento (empate desempata por título). A borda injeta os adapters reais; o
 * Seam 1 injeta os fakes de `Clock` e `Calendar`.
 */
export function projetarAgenda(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): ItemAgenda[] {
  const hoje = clock.hoje()
  const proximoMes = addMeses(mesDe(hoje), 1)

  const itens: ItemAgenda[] = []
  for (const bill of bills) {
    if (bill.estado !== "ativa") continue
    // Ancora na ocorrência corrente (a mesma do farol do card) e caminha pela
    // periodicidade — sempre em fase, sem recalcular a fase aqui.
    let competencia = ocorrenciasRecentes(bill.recurrence, mesDe(hoje), 1)[0]
    while (true) {
      const vencimento = resolverVencimento(
        bill.dueRule,
        bill.dueMonthOffset,
        competencia,
        calendar,
      )
      // ISO `YYYY-MM-DD` compara lexicograficamente; vence hoje conta como em-aberto.
      const aVencer = vencimento > hoje
      // A vencer só entra dentro da janela; vencida não-paga sempre entra (a
      // corrente em aberto). Como o vencimento cresce com a competência, a
      // primeira a vencer fora da janela encerra o caminho.
      if (aVencer && mesDe(vencimento) > proximoMes) break
      const pago = payments.some((p) => p.billId === bill.id && p.competencia === competencia)
      if (!pago) {
        itens.push({
          area: "financas",
          geradorId: bill.id,
          competencia,
          titulo: bill.nome,
          vencimento,
          estado: aVencer ? "aguardando" : "em-aberto",
        })
      }
      competencia = addMeses(competencia, bill.recurrence.intervalMonths)
    }
  }

  return itens.sort((a, b) =>
    a.vencimento === b.vencimento
      ? a.titulo.localeCompare(b.titulo)
      : a.vencimento < b.vencimento
        ? -1
        : 1,
  )
}
