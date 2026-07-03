import { redirect } from "next/navigation"

/** Cadastro de uma Conta nova (wizard). A baixa de valor é outra história (#19). */
export default function NovaContaPage() {
  redirect("/areas/financas/pagamentos-recorrentes?nova=1")
}
