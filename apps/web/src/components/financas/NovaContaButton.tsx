import { Plus } from "lucide-react"
import { Button } from "@/components/ds/Button"

/**
 * Botão primário "Nova Conta" do cabeçalho de Pagamentos Recorrentes — sempre
 * visível (independe de haver Conta), leva à jornada de cadastro de Conta
 * (`?nova=1`, a mesma modal do botão de onboarding do estado-vazio).
 */
export function NovaContaButton() {
  return (
    <Button href="/areas/financas/pagamentos-recorrentes?nova=1" variant="primary">
      <Plus aria-hidden size={16} />
      Nova Conta
    </Button>
  )
}
