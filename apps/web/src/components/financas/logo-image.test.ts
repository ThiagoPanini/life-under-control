import { describe, expect, it } from "vitest"
import { calcularDimensoesAlvo, LADO_MAX_LOGO_PX, prepararArquivoLogo } from "./logo-image"

/** Um File com `size` forjado — jsdom/node não aloca megabytes de verdade. */
function arquivoImagem(tipo = "image/png", bytes = 1000, nome = "logo.png"): File {
  const file = new File(["x"], nome, { type: tipo })
  Object.defineProperty(file, "size", { value: bytes })
  return file
}

describe("calcularDimensoesAlvo — reduz proporcional, nunca amplia", () => {
  it("test_reduz_largura_quando_e_o_lado_maior_preservando_proporcao", () => {
    expect(calcularDimensoesAlvo(1024, 512)).toEqual({ largura: 512, altura: 256 })
  })

  it("test_reduz_altura_quando_e_o_lado_maior_preservando_proporcao", () => {
    expect(calcularDimensoesAlvo(256, 1024)).toEqual({ largura: 128, altura: 512 })
  })

  it("test_nao_amplia_imagem_menor_que_o_limite", () => {
    expect(calcularDimensoesAlvo(200, 100)).toEqual({ largura: 200, altura: 100 })
  })

  it("test_quadrada_no_limite_fica_igual", () => {
    expect(calcularDimensoesAlvo(LADO_MAX_LOGO_PX, LADO_MAX_LOGO_PX)).toEqual({
      largura: 512,
      altura: 512,
    })
  })
})

describe("prepararArquivoLogo — valida tipo/tamanho e normaliza no cliente", () => {
  it("test_rejeita_svg_com_mensagem_de_imagem", async () => {
    const r = await prepararArquivoLogo(arquivoImagem("image/svg+xml", 1000, "logo.svg"))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toBe("Envie uma imagem.")
  })

  it("test_rejeita_arquivo_acima_de_5mb_trazendo_o_limite", async () => {
    const r = await prepararArquivoLogo(arquivoImagem("image/png", 6 * 1024 * 1024))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toContain("5 MB")
  })

  it("test_aceita_imagem_dentro_do_limite", async () => {
    const r = await prepararArquivoLogo(arquivoImagem("image/png", 50_000))
    expect(r.ok).toBe(true)
  })
})
