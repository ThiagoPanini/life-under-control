// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { BillLogoTile } from "./BillLogoTile"

afterEach(cleanup)

describe("BillLogoTile", () => {
  it("test_sem_logo_mostra_o_icone_lucide_em_cor_neutra", () => {
    const { container } = render(<BillLogoTile icon="wifi" logoUrl={null} />)

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("svg")).toBeInTheDocument()
    const tile = container.firstElementChild
    expect(tile?.className).toContain("text-luc-text-3")
    expect(tile?.className).not.toContain("text-luc-accent-bright")
  })

  it("test_com_logo_mostra_a_imagem_dentro_do_tile_neutro", () => {
    const { container } = render(
      <BillLogoTile icon="wifi" logoUrl="https://r2.fake/get/finance/bills/h-1/bill-1/logo" />,
    )

    const img = container.querySelector("img")
    expect(img).toHaveAttribute("src", "https://r2.fake/get/finance/bills/h-1/bill-1/logo")
    const tile = container.firstElementChild
    expect(tile?.className).not.toContain("bg-luc-accent-12")
    expect(tile?.className).toContain("bg-white/")
  })

  it("test_tile_nunca_ganha_ciano_com_ou_sem_logo", () => {
    const semLogo = render(<BillLogoTile icon="wifi" logoUrl={null} />)
    expect(semLogo.container.firstElementChild?.className).not.toContain("bg-luc-accent-12")
    semLogo.unmount()

    const comLogo = render(<BillLogoTile icon="wifi" logoUrl="https://r2.fake/x" />)
    expect(comLogo.container.firstElementChild?.className).not.toContain("bg-luc-accent-12")
  })

  it("test_erro_ao_carregar_a_imagem_cai_no_icone_em_vez_de_travar_no_skeleton", () => {
    const { container } = render(<BillLogoTile icon="wifi" logoUrl="https://r2.fake/expirada" />)

    const img = container.querySelector("img") as HTMLImageElement
    fireEvent.error(img)

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector(".animate-pulse")).toBeNull()
    expect(container.querySelector("svg")).toBeInTheDocument()
  })

  it("test_trocar_o_logo_key_reseta_o_skeleton_em_vez_de_reter_o_estado_carregado_antigo", () => {
    const { container, rerender } = render(
      <BillLogoTile icon="wifi" logoUrl="https://r2.fake/antigo" />,
    )
    const primeiraImg = container.querySelector("img") as HTMLImageElement
    fireEvent.load(primeiraImg)
    expect(container.querySelector(".animate-pulse")).toBeNull()

    rerender(<BillLogoTile icon="wifi" logoUrl="https://r2.fake/novo" />)

    // a troca de logoUrl deve voltar a mostrar o skeleton até a nova imagem carregar
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument()
  })
})
