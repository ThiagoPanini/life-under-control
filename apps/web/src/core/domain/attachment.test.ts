import { describe, expect, it } from "vitest"
import {
  TAMANHO_MAX_BYTES,
  TAMANHO_MAX_LOGO_BYTES,
  validarDadosAttachment,
  validarLogo,
} from "./attachment"

describe("validarLogo — o teto do logo é mais apertado que o do comprovante", () => {
  it("test_teto_do_logo_e_5mb", () => {
    expect(TAMANHO_MAX_LOGO_BYTES).toBe(5 * 1024 * 1024)
  })

  it("test_rejeita_logo_acima_de_5mb_com_o_limite_na_mensagem", () => {
    const erros = validarLogo("image/png", 6 * 1024 * 1024)
    expect(erros).toHaveLength(1)
    expect(erros[0]?.mensagem).toContain("5 MB")
  })

  it("test_aceita_logo_exatamente_no_teto", () => {
    expect(validarLogo("image/png", TAMANHO_MAX_LOGO_BYTES)).toEqual([])
  })

  it("test_svg_segue_barrado", () => {
    const erros = validarLogo("image/svg+xml", 1000)
    expect(erros.some((e) => e.mensagem === "Envie uma imagem.")).toBe(true)
  })
})

describe("validarDadosAttachment — o comprovante conserva o teto de 25 MB", () => {
  it("test_comprovante_de_6mb_ainda_e_aceito", () => {
    expect(TAMANHO_MAX_BYTES).toBe(25 * 1024 * 1024)
    const v = validarDadosAttachment({
      nomeOriginal: "recibo.png",
      tipoMime: "image/png",
      tamanhoBytes: 6 * 1024 * 1024,
    })
    expect(v.ok).toBe(true)
  })
})
