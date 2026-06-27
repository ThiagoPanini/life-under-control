# ADR 0004 — Lockdown: allowlist de dois e-mails + OAuth Google, sem auto-cadastro

- **Status:** Accepted
- **Data:** 2026-06-26
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0002](0002-lar-acesso-simetrico.md) (o que as Pessoas fazem depois de entrar), [CONTEXT.md](../../CONTEXT.md) (invariante 2)

## Contexto

O acesso ao LUC é fechado a exatamente duas pessoas ([ADR-0002](0002-lar-acesso-simetrico.md)), e o dono classificou qualquer acesso de terceiro como catastrófico (dados sensíveis do casal). Precisamos do mecanismo concreto de porta: como as duas — e só as duas — entram, e como tudo o mais fica de fora.

A landing é pública (explica o produto, sem vazar dado); todo o resto fica atrás de login.

Considerado: senha própria (precisaria de fluxo de reset, hashing etc.); magic-link por e-mail (depende do Resend, um segredo de terceiro); OAuth Google (o casal já vive no Google).

## Decisão

**OAuth com Google como provedor de identidade + allowlist server-side de exatamente dois e-mails.** O login só conclui se o e-mail autenticado estiver na allowlist; qualquer outro é rejeitado **depois** do OAuth, antes de criar sessão. **Não há auto-cadastro** — a allowlist é configuração (env/segredo), não uma tabela que cresce por signup.

Portas em série: (1) o Google autentica o e-mail; (2) a allowlist confirma que é uma das duas Pessoas; (3) quando uma borda de WhatsApp existir ([ADR-0003](0003-nucleo-dominio-multi-borda.md)), o número de telefone vira uma allowlist análoga, na mesma lógica.

## Justificativa

- **Allowlist é o cadeado mais simples que existe.** Duas pessoas, conjunto fixo: uma lista de dois e-mails verificada no servidor é menos código e menos superfície que qualquer fluxo de convite/registro. Sem auto-cadastro, não há vetor de "estranho cria conta".
- **Google evita guardar segredo de senha.** Sem hashing, sem reset, sem vazamento de credencial própria. O casal já tem conta Google; o segundo fator é deles.
- **Rejeição pós-OAuth, não confiança no provedor.** O Google diz *quem* é; quem *pode* é decisão do LUC (a allowlist). Trocar de provedor um dia não afrouxa a porta.

## Consequências

- **Positivas:** porta mínima; nada de gestão de senha; a invariante "exatamente duas Pessoas, sem auto-cadastro" (CONTEXT.md #2) vira o código de um `if email in allowlist`.
- **Dependência de terceiro (HITL):** o client_secret do OAuth Google é um segredo que o agente não pode emitir sozinho (console Google) — é um dos quatro casos de parada da autonomia. O agente faz todo o resto e pede só esse segredo.
- **Negativas:** acoplamento ao Google como IdP (lock-in leve; mitigável trocando o adapter de OAuth, já que a autorização real é a allowlist, não o provedor). Se um dia o casal quiser entrar sem Google, troca-se a borda de autenticação — a allowlist permanece.

## Opções rejeitadas

- **Magic-link por e-mail (Resend).** Adiciona dependência de um serviço de envio (segredo de terceiro, custo, deliverability) para resolver o que o OAuth Google já resolve sem caixa de entrada no meio.
- **Senha própria.** Hashing, reset, "esqueci a senha", risco de credential stuffing — todo o aparato de gestão de senha para dois usuários, quando o Google faz de graça.
- **Allowlist em tabela com convite.** "Convite" é a porta de entrada de um terceiro — exatamente o que não pode existir. Allowlist como config fechada é mais segura que allowlist que cresce.
