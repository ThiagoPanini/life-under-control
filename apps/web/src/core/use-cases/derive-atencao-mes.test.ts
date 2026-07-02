import { describe, expect, it } from "vitest"
import { somarPedemAtencaoAgora } from "./derive-atencao-mes"
import type { MarcadorPista } from "./derive-forma-competencia"

function marcador(over: Partial<MarcadorPista> = {}): MarcadorPista {
  return {
    dia: "2026-06-10",
    competencia: "2026-06",
    contaId: "bill-1",
    titulo: "Luz",
    estado: "a-vencer",
    valorEsperado: 9000,
    ...over,
  }
}

describe("somarPedemAtencaoAgora (Seam 1)", () => {
  it("test_soma_so_os_marcadores_a_vencer", () => {
    const marcadores = [
      marcador({ contaId: "luz", estado: "a-vencer", valorEsperado: 9000 }),
      marcador({ contaId: "netflix", estado: "a-vencer", valorEsperado: 3000 }),
      marcador({ contaId: "agua", estado: "aguardando", valorEsperado: 5000 }),
      marcador({ contaId: "internet", estado: "quitada", valorEsperado: 8000 }),
    ]
    expect(somarPedemAtencaoAgora(marcadores)).toEqual({ estado: "estimado", valor: 12000 })
  })

  it("test_ignora_a_vencer_sem_historico", () => {
    const marcadores = [
      marcador({ contaId: "luz", estado: "a-vencer", valorEsperado: null }),
      marcador({ contaId: "netflix", estado: "a-vencer", valorEsperado: 3000 }),
    ]
    expect(somarPedemAtencaoAgora(marcadores)).toEqual({ estado: "estimado", valor: 3000 })
  })

  it("test_nenhum_a_vencer_shape_explicito", () => {
    const marcadores = [marcador({ estado: "aguardando" }), marcador({ estado: "quitada" })]
    expect(somarPedemAtencaoAgora(marcadores)).toEqual({ estado: "sem-historico" })
  })
})
