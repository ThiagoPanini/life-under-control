import { describe, expect, it } from "vitest"
import { mensagemLancamentoRegistrado } from "./lancamento-toast"

/**
 * #100: o toast final da baixa pelo modal compacto identifica a Conta, o **valor**
 * de fato registrado e a **quantidade de comprovantes efetivamente associados** —
 * o número que sobreviveu a eventuais falhas parciais, não o de arquivos tentados.
 */
describe("mensagemLancamentoRegistrado (#100)", () => {
  it("test_identifica_conta_valor_e_comprovantes", () => {
    expect(mensagemLancamentoRegistrado("Luz", 12000, 2)).toBe(
      "Lançamento registrado — Luz · R$ 120,00 · 2 comprovantes",
    )
  })

  it("test_um_comprovante_fica_no_singular", () => {
    expect(mensagemLancamentoRegistrado("Internet", 8990, 1)).toBe(
      "Lançamento registrado — Internet · R$ 89,90 · 1 comprovante",
    )
  })

  it("test_sem_comprovantes_declara_a_ausencia", () => {
    expect(mensagemLancamentoRegistrado("Água", 5000, 0)).toBe(
      "Lançamento registrado — Água · R$ 50,00 · sem comprovantes",
    )
  })
})
