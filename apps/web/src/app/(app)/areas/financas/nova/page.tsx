import { Button } from "@/components/ds/Button"
import { BillWizard } from "@/components/financas/BillWizard"

/** Cadastro de uma Conta nova (wizard). A baixa de valor é outra história (#19). */
export default function NovaContaPage() {
  return (
    <div className="luc-page-gutter py-7 sm:py-9 lg:py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-7">
        <header className="flex flex-col gap-3">
          <Button href="/areas/financas" variant="ghost" className="self-start">
            ← Finanças
          </Button>
          <h1 className="font-extrabold text-3xl text-luc-text tracking-[-0.035em] sm:text-4xl">
            Nova Conta
          </h1>
          <p className="max-w-prose text-luc-text-2 leading-relaxed">
            A regra de um pagamento que se repete: nome, ícone, com que frequência e quando vence.
            Sem valor — ele só existe quando a conta chega.
          </p>
        </header>

        <BillWizard />
      </div>
    </div>
  )
}
