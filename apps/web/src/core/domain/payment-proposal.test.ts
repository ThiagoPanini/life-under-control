import { describe, expect, it } from "vitest"
import {
  botoesDaProposta,
  chaveStaging,
  formatarPropostaMensagem,
  type ResumoProposta,
} from "./payment-proposal"

/** Núcleo puro da Proposta de Lançamento (CONTEXT.md, ADR-0012, issue #158). */
describe("chaveStaging", () => {
  it("test_chave_de_staging_prefixa_area_e_lar_sem_lancamento_ainda", () => {
    // A Proposta ainda não tem Lançamento — a chave é transitória (não a
    // canônica `finance/payments/{lar}/{payment}/{anexo}`), promovida só no Confirmar.
    expect(chaveStaging("lar-1", "prop-1")).toBe("finance/proposals/lar-1/prop-1")
  })
})

describe("botoesDaProposta", () => {
  it("test_tres_botoes_carregam_o_id_da_proposta_na_acao", () => {
    expect(botoesDaProposta("prop-1")).toEqual([
      { id: "confirmar:prop-1", titulo: "Confirmar" },
      { id: "trocar:prop-1", titulo: "Trocar Conta" },
      { id: "cancelar:prop-1", titulo: "Cancelar" },
    ])
  })
})

describe("formatarPropostaMensagem", () => {
  function resumo(over: Partial<ResumoProposta> = {}): ResumoProposta {
    return {
      contaNome: "Condomínio",
      valor: "R$ 1.234,56",
      dataPagamento: "07/07/2026",
      competencia: "Julho/2026",
      ...over,
    }
  }

  it("test_proposta_completa_lista_conta_valor_pagamento_e_competencia", () => {
    const msg = formatarPropostaMensagem(resumo())
    expect(msg).toContain("Condomínio")
    expect(msg).toContain("R$ 1.234,56")
    expect(msg).toContain("07/07/2026")
    expect(msg).toContain("Julho/2026")
  })

  it("test_valor_ilegivel_sinaliza_em_branco_nunca_palpite", () => {
    const msg = formatarPropostaMensagem(resumo({ valor: null }))
    expect(msg).toContain("não consegui ler")
    // Não inventa um valor: nenhum "R$" resta na linha do valor.
    expect(msg).not.toContain("R$ 0")
  })

  it("test_conta_nao_identificada_orienta_trocar_conta", () => {
    const msg = formatarPropostaMensagem(resumo({ contaNome: null }))
    expect(msg).toContain("Trocar Conta")
  })
})
