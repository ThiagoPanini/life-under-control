/**
 * Port de casamento comprovante→Conta por LLM (revisa [ADR-0013](../../../../../docs/adr/0013-extracao-comprovante-llm-port.md)).
 * Distinto do `ReceiptExtractor`, que só lê o que está legível: este usa
 * conhecimento de mundo pra ligar o **favorecido legal** do comprovante ("ENEL
 * DISTRIBUICAO SAO PAULO") ao **apelido** da Conta do Lar ("Luz") — similaridade
 * de string nunca faz essa ponte. Recebe o favorecido e as Contas ativas
 * candidatas; devolve os ids ordenados da mais provável à menos provável, ou
 * **vazio** quando nenhuma serve (abstém — sem palpite, invariante #3).
 *
 * Sem score nem threshold: o humano confirma a Proposta de qualquer jeito
 * (propose-and-confirm, ADR-0012). O topo vira a Conta proposta; a lista inteira
 * alimenta o "Trocar Conta" (#159). A borda injeta o adapter real (Claude no
 * Bedrock, texto — mais barato que a visão do extrator); os use-cases usam um
 * fake, sem rede. O núcleo **não confia** no adapter: só aceita ids do conjunto
 * que ofereceu.
 */
export type ContaCandidata = { billId: string; nome: string }

export type ContaMatcher = (
  favorecido: string | null,
  candidatas: ContaCandidata[],
) => Promise<string[]>
