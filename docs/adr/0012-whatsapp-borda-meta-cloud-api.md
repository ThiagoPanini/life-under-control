# ADR 0012 — WhatsApp como borda de ingestão e notificação via Meta Cloud API

- **Status:** Accepted
- **Data:** 2026-07-06
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0003](0003-nucleo-dominio-multi-borda.md) (a borda de WhatsApp é o caso canônico previsto: borda fina chamando os mesmos use-cases), [ADR-0004](0004-lockdown-allowlist-oauth-google.md) (ponto 3: "o número de telefone vira uma allowlist análoga" — este ADR fecha essa promessa), [ADR-0002](0002-lar-acesso-simetrico.md) (Pessoa autentica e atribui, nunca autoriza), [ADR-0013](0013-extracao-comprovante-llm-port.md) (o extrator que esta borda consome), CONTEXT.md (Fronteira de escopo: "integração de *entrada* é borda de ingestão de fato, permitida sob demanda"; invariantes #1 e #3)

## Contexto

O clímax de Pagamentos Recorrentes é operar pelo WhatsApp em duas vias: **(1)** enviar o comprovante de uma conta paga a um bot que extrai os dados e registra o Lançamento, e **(2)** receber alertas de vencimento. A escolha do canal determina tudo a jusante — forma do webhook, identidade do remetente, regras de mensagem (janela de 24h × templates aprovados), custo e risco de banimento. O dado do casal é real e irreplicável: o canal não pode ser frágil nem pode inserir fato sem controle humano.

## Decisão

**Canal.** Integração direta com a **WhatsApp Cloud API oficial da Meta** (sem BSP intermediário), com **número dedicado ao bot** (nunca o número pessoal de uma Pessoa). Mensagens do casal ao bot abrem a janela de 24h — todo o fluxo de ingestão (proposta, botões, confirmação) usa mensagens livres, sem depender de aprovação de template; só o alerta iniciado pelo LUC usa **template utility** aprovado.

**Borda.** Route Handlers `GET`/`POST /api/webhooks/whatsapp` — a primeira borda não-UI do app, nos moldes do ADR-0003: valida (assinatura `x-hub-signature-256` sobre o corpo bruto; verify token no `GET`), resolve a Pessoa e chama os mesmos use-cases do portal. Borda nunca fala com o store direto.

**Identidade e autorização.** `users.whatsappPhone` (E.164, único, nullable), preenchido por **ato no portal** — cada Pessoa vincula o próprio número, espelhando o vínculo Google. **A coluna é a allowlist**: remetente que não resolve para uma Pessoa é ignorado em silêncio (sem resposta, só log). Não há env de allowlist redundante — duas fontes para a mesma verdade divergem. Autoria: `paidBy` default = remetente (editável no portal, como todo Lançamento).

**Propor + confirmar, sempre.** Nada vira fato sem aval humano: o bot responde ao comprovante com uma **Proposta de Lançamento** (Conta casada, valor, data, Competência) e botões interativos; `recordPayment` + anexo só rodam no Confirmar. Extração errada nunca entra no dado real sem um humano olhar — a mesma filosofia do backfill ("divergência → revisar, nunca inserção silenciosa"), agravada por aqui o comprovante ser fonte única.

**Processamento.** O webhook grava o evento e responde 200 imediatamente; o trabalho pesado (download da mídia, extração, matching) roda pós-resposta (`after()` do Next 15) no mesmo container — sem fila externa no volume de um Lar. Idempotência por `wa_message_id` e log auditável em `whatsapp_events`; proposta pendente em `whatsapp_proposals` (proposta → confirmada/cancelada/expirada). A mídia é baixada na hora (a URL da Meta expira em minutos) e estacionada no R2 em chave de staging; vira Anexo canônico (caminho server-side já existente) no Confirmar.

**Alertas.** **Digest diário às 08:00** (America/Sao_Paulo) para **as duas Pessoas** (acesso simétrico), enviado só quando há Conta vencida / vence hoje / vence em breve — derivado na hora de `derivarTiraAtencao`, sem estado de vencimento persistido (invariante #3). Gatilho: scheduled task do Coolify chamando Route Handler autenticado por segredo. Dedup de um digest por dia por pessoa via `whatsapp_events`.

## Justificativa

- **Só a API oficial tem garantia de continuidade** para um canal que carrega dado irreplicável — e seu webhook HTTPS encaixa sem atrito no modelo de borda fina que o repo já pratica.
- **O custo no volume de um Lar é desprezível**: ingestão e respostas na janela de 24h são gratuitas; o digest utility custa centavos por mês. O argumento de custo não justifica alternativas frágeis.
- **A coluna como allowlist única** evita o drift entre env e banco; diferente do e-mail (onde o gate roda antes de existir sessão), aqui toda mensagem útil já exige resolver a Pessoa — a resolução *é* o gate.
- **Confirmar sempre custa um toque; auto-lançar custa confiança.** Relaxar depois (auto-lançar em match perfeito) é barato; recolher a confiança depois de dado sujo, não.

## Consequências

- **Positivas:** as duas features compartilham a mesma fundação (app Meta, número, webhook, client, identidade); a ingestão fica utilizável sem esperar aprovação de template; o portal continua sendo a fonte dos atos (o vínculo do telefone nasce lá).
- **Negativas / aceito:** dependência de ativos Meta que só o operador provê (caso 3 da autonomia: app Business, número dedicado, tokens); o `after()` não tem retry próprio — se o container reiniciar no meio, o evento fica em `recebido` e depende de retry da Meta ou reprocesso manual (aceito para 2 usuários; fila só se doer na prática); um número dedicado a manter (chip/virtual).
- As tabelas `whatsapp_*` são estado de borda/adapter, não de domínio — nenhum primitivo novo nasce aqui; a Proposta de Lançamento (CONTEXT.md) nomeia o estado transitório justamente para não contaminá-lo com Lançamento.

## Opções rejeitadas

- **Baileys / bibliotecas não-oficiais.** Zero burocracia e custo, mas viola os ToS (risco real de banir o número), exige socket persistente com re-scan de QR e quebra em silêncio quando a Meta muda o protocolo. Frágil demais para o dado do casal.
- **BSP (Twilio, Zenvia, 360dialog…).** Onboarding mais guiado, porém custo por mensagem + markup, lock-in e uma camada a mais sem ganho no volume de um Lar.
- **Env `WHATSAPP_ALLOWED_NUMBERS` (com ou sem coluna).** Ou duplica a verdade da coluna (drift), ou esconde dado de domínio em config de infra e viola "tudo nasce de um ato no portal".
- **Auto-lançar em alta confiança.** Zero fricção no caminho feliz, mas erro de extração entraria no dado real antes de um humano ver; fica como evolução possível *depois* de confiança acumulada.
- **Fila dedicada (BullMQ/Redis) desde o início.** Infra permanente para ~2 comprovantes/dia; o `after()` + evento persistido cobre o cenário com custo zero.
- **Alertas por transição de estado.** Mais imediatos, mas exigem estado de "já alertado" por (Conta, Competência, estado), mais templates e mais ruído; o digest diário é derivação pura e suficiente como primeiro degrau.

## Gatilhos de reabertura

- A Meta banir/travar o número ou a burocracia de verificação inviabilizar o canal — reabre a escolha (BSP como plano B, nunca Baileys).
- Confiança acumulada no matching fizer o toque de confirmação doer — reabre o degrau "auto-lançar em match unívoco com desfazer".
- O `after()` perder eventos com frequência observável — promove a fila com worker.
- Sentir falta de urgência para "vencida" — adiciona a escalada por transição sobre o digest (o híbrido já desenhado).

## Emenda — #178: menu Alterar (estado de conversa por remetente + texto livre por campo)

A borda de ingestão deixou de ser **só botões**. O antigo "Trocar Conta" (#159) virou um menu **Alterar** que edita **todo** campo coletado da Proposta pelo próprio WhatsApp — Conta, Competência (mês), Valor, Data de pagamento e Favorecido — antes do Confirmar. Isso revisa a decisão de "propor + confirmar": o Confirmar segue sendo o único ato que vira fato, mas agora o casal corrige a Proposta no chat em vez de abrir o portal.

**Guiado por menu, nunca NLU de intenção.** Alterar abre a lista de campos; Conta/Mês se editam por lista (a shortlist do matcher, #177, e as Competências recentes da recorrência da Conta); Valor/Data/Favorecido por **texto livre lido só como aquele campo**. O bot fica sempre num estado conhecido — "esperando o campo Y da Proposta X desta Pessoa" — e nunca classifica intenção de texto aberto. É o mesmo princípio do ADR-0013 ("a IA ordena/lê, não cria fato"), aqui sem IA nenhuma na edição: os parsers são determinísticos (`parseCentavos`, `parseDataBrParaIso` + `ehDataIsoValida`).

**Estado de conversa na Proposta.** A tabela `whatsapp_proposals` ganha `aguardando_campo` (`valor`/`data`/`favorecido`) e `aguardando_por` (a Pessoa) — migração aditiva. Ao pedir um campo de texto, a Proposta guarda o par; a próxima mensagem de texto **daquela Pessoa** é lida como aquele campo (`editarCampoTexto`, na borda), gravada e a Proposta é re-ofertada. Um slot por Pessoa: pedir um novo campo libera o anterior. Valor/data editados são **fato humano — confiado, mas validado** (centavos > 0, data ISO real); persiste-se o fato, o parser é a validação (CONTEXT.md #3 segue valendo).

**Colisões (todas testadas com fakes):** comprovante novo no meio da edição = Proposta nova, **larga** a edição pendente da Pessoa; texto solto sem Alterar = **eco de instrução** (edição só pelo caminho explícito); parse falho = **reprompt 1× com exemplo**, mantendo a pendência; Confirmar usa o estado corrente; Cancelar não deixa fato.

**Consequência de borda:** a fábrica de edição por texto é **leve** (repo/billRepo/messenger/clock, sem R2/Bedrock) — uma mensagem de texto nunca falha por env de mídia ausente, como o eco de fase 0. Nada disso é primitivo de domínio novo: o estado de conversa é da borda (a tabela `whatsapp_*`), não do Lançamento.
