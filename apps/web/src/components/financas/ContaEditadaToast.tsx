"use client"

import { QueryParamToast } from "@/components/financas/QueryParamToast"

/**
 * Toast de sucesso da edição rápida (#97): a action redireciona com `?editado=` e
 * este componente mostra o toast, delegando a limpeza da URL ao `QueryParamToast`.
 */
export function ContaEditadaToast({ mensagem }: { mensagem: string }) {
  return <QueryParamToast mensagem={mensagem} />
}
