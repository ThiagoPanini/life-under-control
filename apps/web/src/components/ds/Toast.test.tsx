// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Toast } from "./Toast"

/**
 * Um `onDismiss` inline (`() => algo()`) tem identidade nova a cada render do
 * pai — sem regressão em: o timer não pode reiniciar por causa disso.
 */
function ToastComOnDismissInline({ chamadas }: { chamadas: () => void }) {
  return <Toast mensagem="Lançamento registrado" duracaoMs={1000} onDismiss={() => chamadas()} />
}

/** Seam 2 (borda): o toast é `role="status"` e some sozinho após `duracaoMs`. */
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Toast (Seam 2, #63)", () => {
  it("test_mostra_a_mensagem_com_role_status", () => {
    render(<Toast mensagem="Lançamento registrado — Internet · Junho/2026" />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "Lançamento registrado — Internet · Junho/2026",
    )
  })

  it("test_some_sozinho_apos_a_duracao", () => {
    render(<Toast mensagem="Lançamento registrado" duracaoMs={1000} />)
    expect(screen.getByRole("status")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("test_chama_onDismiss_quando_some", () => {
    const onDismiss = vi.fn()
    render(<Toast mensagem="Lançamento registrado" duracaoMs={1000} onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(1000))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it("test_com_icone_e_fechar_dispensa_na_hora_chamando_onDismiss", () => {
    // toast de confirmação (#97): ícone antes da mensagem + botão de fechar que
    // dispensa antes do timer, chamando o mesmo onDismiss (ex.: limpar a URL).
    const onDismiss = vi.fn()
    render(
      <Toast
        mensagem="Conta atualizada — Luz"
        duracaoMs={4000}
        onDismiss={onDismiss}
        icone={<svg aria-hidden role="img" />}
        comFechar
      />,
    )
    const status = screen.getByRole("status")
    expect(status.querySelector("svg")).toBeInTheDocument()
    act(() => {
      screen.getByRole("button", { name: "Fechar" }).click()
    })
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("test_reidentidade_do_onDismiss_nao_reinicia_o_timer", () => {
    // um onDismiss inline (identidade nova a cada render do pai) não pode
    // reiniciar a contagem — senão um pai que re-renderiza por outro motivo
    // faz o toast durar mais do que os duracaoMs documentados.
    const chamadas = vi.fn()
    const { rerender } = render(<ToastComOnDismissInline chamadas={chamadas} />)

    act(() => vi.advanceTimersByTime(700))
    rerender(<ToastComOnDismissInline chamadas={chamadas} />) // onDismiss é outra closure agora
    act(() => vi.advanceTimersByTime(300)) // completa os 1000ms originais

    expect(chamadas).toHaveBeenCalledOnce()
    expect(screen.queryByRole("status")).toBeNull()
  })
})
