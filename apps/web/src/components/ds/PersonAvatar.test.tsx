// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// next/image detecta "carregada" via naturalWidth, sempre 0 no jsdom (não baixa
// bytes de verdade) — mockamos pro <img> nativo, testando nossa lógica de
// skeleton (o onLoad), não a heurística interna do Next.
vi.mock("next/image", () => ({
  default: ({ onLoad, ...rest }: ComponentProps<"img"> & { onLoad?: () => void }) => (
    // biome-ignore lint/a11y/useAltText: alt vem de `rest` no teste
    // biome-ignore lint/performance/noImgElement: mock de next/image no teste
    <img onLoad={onLoad} {...rest} />
  ),
}))

import { PersonAvatar } from "./PersonAvatar"

afterEach(cleanup)

const colors = { color: "var(--luc-thiago-fg)", backgroundColor: "var(--luc-thiago-bg)" }

describe("PersonAvatar (Seam 3)", () => {
  it("test_sem_avatarurl_mostra_fallback_inicial_e_cor", () => {
    render(<PersonAvatar inicial="T" nome="Thiago" size={26} colors={colors} />)

    const fallback = screen.getByLabelText("Thiago")
    expect(fallback).toHaveTextContent("T")
    expect(fallback.style.color).toBe("var(--luc-thiago-fg)")
    expect(fallback.style.backgroundColor).toBe("var(--luc-thiago-bg)")
    expect(screen.queryByRole("img", { name: "Thiago" })).not.toHaveAttribute("src")
  })

  it("test_com_avatarurl_mostra_skeleton_ate_a_imagem_carregar", () => {
    const { container } = render(
      <PersonAvatar
        avatarUrl="https://conta.r2.cloudflarestorage.com/foto.jpg"
        inicial="T"
        nome="Thiago"
        size={26}
        colors={colors}
      />,
    )

    expect(container.querySelector("[aria-hidden].animate-pulse")).toBeInTheDocument()

    const img = screen.getByAltText("Thiago")
    fireEvent.load(img)

    expect(container.querySelector("[aria-hidden].animate-pulse")).not.toBeInTheDocument()
  })

  it("test_geometria_quadrado_arredondado_via_classname_nunca_circulo", () => {
    render(
      <PersonAvatar
        inicial="T"
        nome="Thiago"
        size={26}
        colors={colors}
        className="rounded-luc-sm"
      />,
    )

    expect(screen.getByLabelText("Thiago").className).toContain("rounded-luc-sm")
    expect(screen.getByLabelText("Thiago").className).not.toContain("rounded-full")
  })
})
