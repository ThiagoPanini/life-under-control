import type { BotaoInterativo, LinhaInterativa } from "../domain/payment-proposal"

/**
 * Um template pré-aprovado da Meta (o único caminho para iniciar conversa fora
 * da janela de 24h). O digest de vencimentos (#160) usa o utility
 * `digest_vencimentos` (#157); `params` preenche os `{{n}}` do corpo na ordem.
 */
export type TemplateWhatsapp = {
  nome: string
  /** Código de idioma da Meta (ex.: `pt_BR`). */
  idioma: string
  /** Parâmetros do body, na ordem dos `{{1}}…{{n}}`. Nunca vazio nem multi-linha. */
  params: string[]
}

/**
 * Port de envio de mensagens WhatsApp (ADR-0012, issues #155/#158). O adapter
 * fino fala com a Graph API; o eco de fase 0 usa só `enviarTexto`, a Proposta de
 * Lançamento (#158) responde com `enviarBotoes`.
 */
export type WhatsappMessenger = {
  /** Envia texto livre pro número em E.164. */
  enviarTexto(para: string, corpo: string): Promise<void>
  /**
   * Envia uma mensagem com botões de resposta rápida (a Proposta: Confirmar /
   * Alterar / Cancelar). A Graph API aceita no máximo 3 botões.
   */
  enviarBotoes(para: string, corpo: string, botoes: BotaoInterativo[]): Promise<void>
  /**
   * Envia uma lista interativa (o menu Alterar e as listas de Conta/Mês, #159/#178):
   * uma linha selecionável por opção. `rotuloBotao` é o texto do botão que abre a
   * lista (≤20 chars) — varia por contexto (Escolher campo/Conta/mês), nunca fixo.
   * A Graph API aceita no máximo 10 linhas.
   */
  enviarLista(
    para: string,
    corpo: string,
    linhas: LinhaInterativa[],
    rotuloBotao: string,
  ): Promise<void>
  /**
   * Envia um template pré-aprovado (o digest de vencimentos, #160): fora da
   * janela de 24h só o template inicia a conversa. Os `params` viram o body
   * `components` na ordem dos `{{n}}`. Diferente dos demais (que engolem falha),
   * **devolve `true` só quando a Meta aceitou** — o digest reivindica o dedup só
   * no sucesso, senão um envio falho poisonaria o dia (#160).
   */
  enviarTemplate(para: string, template: TemplateWhatsapp): Promise<boolean>
}
