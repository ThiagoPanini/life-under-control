import { describe, expect, it } from "vitest"
import {
  botoesDaProposta,
  chaveStaging,
  ehCampoLivre,
  estaExpirada,
  formatarLancamentoCriado,
  formatarPropostaMensagem,
  linhasCamposProposta,
  linhasCompetenciasProposta,
  linhasContasProposta,
  mensagemPropostaExpirada,
  parsearAcaoBotao,
  promptEdicaoCampo,
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
  it("test_tres_botoes_confirmar_alterar_cancelar_carregam_o_id_da_proposta", () => {
    // #178: o botão do meio virou "Alterar" (menu de campos), no lugar de "Trocar Conta".
    expect(botoesDaProposta("prop-1")).toEqual([
      { id: "confirmar:prop-1", titulo: "Confirmar" },
      { id: "alterar:prop-1", titulo: "Alterar" },
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

  it("test_conta_nao_identificada_orienta_alterar", () => {
    const msg = formatarPropostaMensagem(resumo({ contaNome: null }))
    expect(msg).toContain("Alterar")
  })
})

describe("parsearAcaoBotao", () => {
  it("test_botao_confirmar_cancelar_devolve_acao_e_proposta", () => {
    expect(parsearAcaoBotao("confirmar:prop-1")).toEqual({
      acao: "confirmar",
      proposalId: "prop-1",
    })
    expect(parsearAcaoBotao("cancelar:prop-1")).toEqual({ acao: "cancelar", proposalId: "prop-1" })
  })

  it("test_botao_alterar_e_o_trocar_legado_caem_na_mesma_acao", () => {
    expect(parsearAcaoBotao("alterar:prop-1")).toEqual({ acao: "alterar", proposalId: "prop-1" })
    // Botão "Trocar Conta" de uma Proposta anterior ao #178 ainda roteia pro menu.
    expect(parsearAcaoBotao("trocar:prop-1")).toEqual({ acao: "alterar", proposalId: "prop-1" })
  })

  it("test_linha_de_lista_devolve_escolher_conta_com_billId", () => {
    expect(parsearAcaoBotao("conta:prop-1:bill-luz")).toEqual({
      acao: "escolher-conta",
      proposalId: "prop-1",
      billId: "bill-luz",
    })
  })

  it("test_linha_de_campo_devolve_escolher_campo_validado", () => {
    expect(parsearAcaoBotao("campo:prop-1:valor")).toEqual({
      acao: "escolher-campo",
      proposalId: "prop-1",
      campo: "valor",
    })
    // Campo fora do conjunto conhecido → null (nunca chuta).
    expect(parsearAcaoBotao("campo:prop-1:apagar")).toBeNull()
  })

  it("test_linha_de_mes_devolve_escolher_mes_com_competencia_valida", () => {
    expect(parsearAcaoBotao("mes:prop-1:2026-07")).toEqual({
      acao: "escolher-mes",
      proposalId: "prop-1",
      competencia: "2026-07",
    })
    // Competência malformada → null.
    expect(parsearAcaoBotao("mes:prop-1:2026-13")).toBeNull()
  })

  it("test_id_irreconhecivel_devolve_null_nunca_chuta", () => {
    expect(parsearAcaoBotao("oi")).toBeNull()
    expect(parsearAcaoBotao("apagar:prop-1")).toBeNull()
    expect(parsearAcaoBotao("confirmar:")).toBeNull()
    expect(parsearAcaoBotao("conta:prop-1")).toBeNull()
  })
})

describe("menu Alterar (#178)", () => {
  it("test_linhas_do_menu_cobrem_os_cinco_campos_editaveis", () => {
    const linhas = linhasCamposProposta("prop-1")
    expect(linhas.map((l) => l.id)).toEqual([
      "campo:prop-1:conta",
      "campo:prop-1:competencia",
      "campo:prop-1:valor",
      "campo:prop-1:data",
      "campo:prop-1:favorecido",
    ])
    // Cada linha ré-parseia pro campo certo (round-trip com o parser).
    expect(parsearAcaoBotao(linhas[2].id)).toEqual({
      acao: "escolher-campo",
      proposalId: "prop-1",
      campo: "valor",
    })
  })

  it("test_linhas_de_mes_rotulam_por_extenso_e_carregam_a_competencia", () => {
    const linhas = linhasCompetenciasProposta("prop-1", ["2026-06", "2026-07"])
    expect(linhas).toEqual([
      { id: "mes:prop-1:2026-06", titulo: "Junho de 2026" },
      { id: "mes:prop-1:2026-07", titulo: "Julho de 2026" },
    ])
  })

  it("test_ehCampoLivre_separa_texto_livre_de_lista", () => {
    expect(ehCampoLivre("valor")).toBe(true)
    expect(ehCampoLivre("data")).toBe(true)
    expect(ehCampoLivre("favorecido")).toBe(true)
    expect(ehCampoLivre("conta")).toBe(false)
    expect(ehCampoLivre("competencia")).toBe(false)
  })

  it("test_prompt_de_campo_livre_traz_um_exemplo", () => {
    expect(promptEdicaoCampo("valor")).toContain("253,43")
    expect(promptEdicaoCampo("data")).toContain("05/07/2026")
    expect(promptEdicaoCampo("favorecido").toLowerCase()).toContain("favorecido")
  })
})

describe("linhasContasProposta", () => {
  it("test_cada_conta_vira_linha_com_id_da_proposta_e_da_conta", () => {
    const linhas = linhasContasProposta("prop-1", [
      { billId: "bill-luz", nome: "Luz" },
      { billId: "bill-agua", nome: "Água" },
    ])
    expect(linhas).toEqual([
      { id: "conta:prop-1:bill-luz", titulo: "Luz" },
      { id: "conta:prop-1:bill-agua", titulo: "Água" },
    ])
  })

  it("test_titulo_longo_corta_no_limite_do_whatsapp", () => {
    const [linha] = linhasContasProposta("prop-1", [
      { billId: "b", nome: "Conta com um nome bem maior que o limite de vinte e quatro" },
    ])
    expect(linha.titulo.length).toBeLessThanOrEqual(24)
    expect(parsearAcaoBotao(linha.id)).toEqual({
      acao: "escolher-conta",
      proposalId: "prop-1",
      billId: "b",
    })
  })
})

describe("estaExpirada", () => {
  const criadoEm = "2026-07-07T12:00:00.000Z"
  it("test_dentro_do_ttl_nao_expirou", () => {
    expect(estaExpirada({ criadoEm }, "2026-07-14")).toBe(false)
  })
  it("test_passado_o_ttl_expirou", () => {
    expect(estaExpirada({ criadoEm }, "2026-07-15")).toBe(true)
  })
})

describe("mensagens de #159", () => {
  it("test_proposta_expirada_orienta_reenviar", () => {
    expect(mensagemPropostaExpirada().toLowerCase()).toContain("expirou")
  })

  it("test_lancamento_criado_confirma_o_registro", () => {
    const msg = formatarLancamentoCriado({
      contaNome: "Luz",
      valor: "R$ 253,43",
      dataPagamento: "05/07/2026",
      competencia: "Julho/2026",
    })
    expect(msg).toContain("Registrei")
    expect(msg).toContain("Luz")
    expect(msg).toContain("R$ 253,43")
    expect(msg).toContain("Julho/2026")
  })
})
