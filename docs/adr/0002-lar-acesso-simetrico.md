# ADR 0002 — O Lar é a unidade de dados, com acesso simétrico entre as duas Pessoas

- **Status:** Accepted
- **Data:** 2026-06-26
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0004](0004-lockdown-allowlist-oauth-google.md) (o mecanismo de porta — como as duas Pessoas entram), [CONTEXT.md](../../CONTEXT.md) (invariantes 1 e 2)

## Contexto

O LUC serve um casal. A pergunta de modelagem: as duas pessoas são dois "tenants"/contas que compartilham recursos seletivamente (modelo SaaS — ACL, visibilidade por recurso, "compartilhado comigo"), ou são duas chaves de uma única caixa?

O dono foi categórico: "tudo o que eu vejo, a outra pessoa também verá" — e o oposto seria "uma tragédia sem precedentes" (expor dados sensíveis). Não há, no domínio, nenhum dado que uma Pessoa deva esconder da outra.

## Decisão

**O `Household` (Lar) é o dono de todos os dados.** Toda entidade pertence ao Lar, não a uma Pessoa. **O acesso é simétrico**: as duas Pessoas veem e editam exatamente o mesmo conjunto, sempre.

**`User` (Pessoa) serve para autenticar e atribuir autoria — nunca para autorizar.** "Quem pagou", "de quem é a consulta" é metadado factual de autoria; não governa visibilidade nem permissão. Não há ACL, não há flag de privacidade, não há "compartilhar com".

O Lar tem **exatamente duas Pessoas**, fixas, sem auto-cadastro (mecanismo no [ADR-0004](0004-lockdown-allowlist-oauth-google.md)).

## Justificativa

- **Reflete a realidade modelada.** Um casal que decidiu organizar a vida junto não tem fronteira de visibilidade interna. Modelar ACL seria construir uma porta para um cômodo que não existe.
- **Simplicidade que vira segurança.** Sem ACL, não há ACL para errar. A autorização degenera para uma única pergunta — "é uma das duas Pessoas do Lar?" — verificada uma vez ([ADR-0004](0004-lockdown-allowlist-oauth-google.md)), não por recurso. Menos superfície, menos bug de vazamento.
- **Autoria ≠ autorização.** O dono quer saber "quem pagou" e "quanto perdi por atraso" (analítica de autoria), o que se resolve com um campo de atribuição — sem acoplar isso a quem pode ver, que é sempre "os dois".

## Consequências

- **Positivas:** modelo de dados sem dimensão de permissão; queries nunca filtram por dono; a UI nunca tem estado "isto está oculto pra você".
- **Negativas / aceito:** o modelo é **não-extensível para multi-usuário** por construção. Se um dia o LUC precisasse de um terceiro com visão parcial (um contador, um filho com acesso restrito), seria refatoração real — e isso é deliberado: a Fronteira de escopo (CONTEXT.md) declara que o LUC **não** é multi-tenant. O acesso simétrico é invariante (CONTEXT.md #1), não preferência.
- O par "acesso simétrico aqui + allowlist de 2 no [ADR-0004](0004-lockdown-allowlist-oauth-google.md)" é o que materializa o "fechado para exatamente duas pessoas".

## Opções rejeitadas

- **Modelo SaaS (conta por Pessoa + compartilhamento seletivo).** Resolve um problema que o domínio não tem; cada recurso ganharia uma dimensão de visibilidade que sempre teria o mesmo valor ("ambos"). Custo permanente, benefício zero, e mais caminhos para um vazamento — o exato desastre a evitar.
- **Uma conta única compartilhada (login conjunto).** Mataria a autoria ("quem pagou") e o segundo fator por pessoa. Duas Pessoas com autoria, sobre dados em comum, é melhor que uma conta sem rosto.
