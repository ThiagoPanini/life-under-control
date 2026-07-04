"use client"

import { useTransition } from "react"
import { reativarConta } from "@/app/(app)/areas/financas/actions"
import { QueryParamToast } from "@/components/financas/QueryParamToast"

/**
 * Toast da exclusão de Conta (#99): a action redireciona com `?excluido=<id>` e
 * este componente levanta o toast por 4,2s, com botão de fechar e a ação
 * **Desfazer**. Desfazer chama `reativarConta` numa transição (não trava a UI); a
 * reativação redireciona pra lista limpa, então a ação some o toast sem limpar a
 * URL por baixo dela (o `Toast` cancela o auto-dismiss ao acionar a ação). A
 * limpeza do parâmetro no expirar do toast fica com o `QueryParamToast`.
 */
export function ContaExcluidaToast({ mensagem, billId }: { mensagem: string; billId: string }) {
  const [, startTransition] = useTransition()
  return (
    <QueryParamToast
      mensagem={mensagem}
      duracaoMs={4200}
      acao={{
        rotulo: "Desfazer",
        aoAcionar: () => startTransition(() => reativarConta(billId)),
      }}
    />
  )
}
