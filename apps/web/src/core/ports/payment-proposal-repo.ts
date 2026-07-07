import type { CampoLivre, NovaPaymentProposal, PaymentProposal } from "../domain/payment-proposal"

/**
 * `criar` colidiu com uma Proposta **ativa** de mesmo hash (o índice único
 * parcial do banco decidiu, fechando a corrida check-then-insert entre duas
 * entregas concorrentes do mesmo arquivo). A borda trata como repetição —
 * avisa referenciando a existente, não duplica.
 */
export class PropostaDuplicadaError extends Error {
  constructor(readonly bytesHash: string) {
    super("Já existe uma Proposta ativa para este comprovante")
    this.name = "PropostaDuplicadaError"
  }
}

/**
 * Port de persistência da Proposta de Lançamento (ADR-0003, ADR-0012, issue
 * #158). Estado de borda/adapter (a tabela `whatsapp_proposals`), não primitivo
 * de domínio (ADR-0005): a Proposta nomeia o transitório para não contaminar o
 * Lançamento. Escopado por `householdId` (o Lar) — acesso simétrico (#1).
 */
export type PaymentProposalRepo = {
  /**
   * Grava uma Proposta nova (nasce no estado `proposta`) e devolve a forma de
   * domínio. Lança `PropostaDuplicadaError` se já há Proposta ativa de mesmo
   * `(householdId, bytesHash)` — o índice único parcial fecha a corrida.
   */
  criar(nova: NovaPaymentProposal): Promise<PaymentProposal>
  /**
   * Acha a Proposta **ativa** (estado `proposta` ou `confirmada`) do Lar com o
   * mesmo hash de bytes — a detecção de comprovante repetido (mesmo arquivo). O
   * mesmo hash em Proposta aberta ou já virada Lançamento gera aviso, não
   * duplicata; `cancelada`/`expirada` não conta (reenviar depois de cancelar
   * abre uma Proposta nova). `null` se não há repetição ativa.
   */
  obterAtivaPorHash(householdId: string, bytesHash: string): Promise<PaymentProposal | null>
  /** A Proposta do Lar por id (qualquer estado) — os botões agem sobre ela. `null` se não existe. */
  obterPorId(householdId: string, id: string): Promise<PaymentProposal | null>
  /**
   * Transição CAS `proposta → confirmada` — o **commit** do Confirmar. Devolve a
   * Proposta atualizada, ou `null` se ela **já não estava** em `proposta` (corrida
   * concorrente perdida): só um Confirmar persiste o Lançamento; o perdedor da
   * corrida desfaz o que criou (o clique repetido já é barrado antes, pelo estado).
   */
  confirmar(householdId: string, id: string): Promise<PaymentProposal | null>
  /** Transição CAS `proposta → cancelada` (o Cancelar). `null` se já não estava em `proposta`. */
  cancelar(householdId: string, id: string): Promise<PaymentProposal | null>
  /** Transição CAS `proposta → expirada` (limpeza lazy ou varredura). `null` se já não estava em `proposta`. */
  marcarExpirada(householdId: string, id: string): Promise<PaymentProposal | null>
  /**
   * Regrava Conta e Competência de uma Proposta ainda aberta (Alterar → Conta) e
   * **limpa** a edição pendente. `null` se não está em `proposta`.
   */
  atualizarConta(
    householdId: string,
    id: string,
    billId: string,
    competencia: string | null,
  ): Promise<PaymentProposal | null>
  /**
   * Regrava só a Competência (Alterar → Mês) e limpa a edição pendente. `null` se
   * não está em `proposta`.
   */
  atualizarCompetencia(
    householdId: string,
    id: string,
    competencia: string,
  ): Promise<PaymentProposal | null>
  /**
   * Grava o valor de um campo de texto livre editado (Alterar → Valor/Data/
   * Favorecido) e **limpa** a edição pendente (`aguardando*` → null). O `patch`
   * traz só o campo mexido. `null` se não está em `proposta`.
   */
  atualizarCampo(
    householdId: string,
    id: string,
    patch: Partial<Pick<PaymentProposal, "valorCentavos" | "dataPagamento" | "favorecido">>,
  ): Promise<PaymentProposal | null>
  /**
   * Marca que o bot espera um campo de texto livre desta Pessoa (Alterar →
   * Valor/Data/Favorecido): seta `aguardandoCampo`/`aguardandoPor` na Proposta e
   * **libera qualquer outra edição pendente da mesma Pessoa** (um slot por Pessoa).
   * CAS `proposta`; `null` se já não está aberta.
   */
  definirAguardando(
    householdId: string,
    id: string,
    campo: CampoLivre,
    pessoa: string,
  ): Promise<PaymentProposal | null>
  /**
   * A Proposta aberta em que esta Pessoa tem uma edição de texto pendente
   * (`aguardandoPor` = pessoa, `aguardandoCampo` não-nulo) — a próxima mensagem de
   * texto do remetente é lida como esse campo. `null` se não há edição pendente.
   */
  obterAguardandoPor(householdId: string, pessoa: string): Promise<PaymentProposal | null>
  /**
   * Libera toda edição pendente desta Pessoa no Lar (colisão: um comprovante novo
   * no meio da edição larga a edição pendente — a Proposta nova assume).
   */
  limparAguardando(householdId: string, pessoa: string): Promise<void>
  /** Todas as Propostas ainda abertas (`proposta`) — a varredura oportunista filtra as expiradas pelo relógio. */
  listarAbertas(): Promise<PaymentProposal[]>
}
