"use client"

import { usePathname, useRouter } from "next/navigation"
import { Toast } from "@/components/ds/Toast"

/**
 * Toast levantado por parâmetro de query (`?editado=`, `?excluido=`, …) — a única
 * forma de o Server Component avisar o cliente depois de um `redirect`. Mostra o
 * Toast (na veste info, com botão de fechar) e só limpa o parâmetro quando ele já
 * sumiu (`onDismiss`), nunca antes, pra o refetch do RSC não cortar o toast no
 * meio. Concentra num lugar só o contrato de limpeza da URL, antes duplicado
 * entre os toasts de edição e de exclusão de Conta.
 */
export function QueryParamToast({
  mensagem,
  duracaoMs,
  acao,
}: {
  mensagem: string
  duracaoMs?: number
  /** Ação em linha (ex.: "Desfazer" da exclusão, #99) — some na hora, sem limpar a URL. */
  acao?: { rotulo: string; aoAcionar: () => void }
}) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <Toast
      mensagem={mensagem}
      duracaoMs={duracaoMs}
      comFechar
      acao={acao}
      onDismiss={() => router.replace(pathname, { scroll: false })}
    />
  )
}
