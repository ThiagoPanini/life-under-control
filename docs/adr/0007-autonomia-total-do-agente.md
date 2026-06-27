# ADR 0007 — Autonomia total do agente, com o dado do casal protegido

- **Status:** Accepted
- **Data:** 2026-06-26
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0001](0001-app-unico-next-fullstack.md) (substrato: app único no Coolify), [ADR-0004](0004-lockdown-allowlist-oauth-google.md) (a porta que mantém o dado fechado), fluxo vivo em [docs/agents/workflow.md](../agents/workflow.md), fronteira de triagem em [docs/agents/triage-labels.md](../agents/triage-labels.md)

## Contexto

Os MCP servers de Hostinger, Coolify e Cloudflare dão ao agente capacidade de tocar produção e infra. O LUC é um projeto **solo, sem usuários externos** — só o casal —, hospedado numa VPS compartilhada (panlabs) gerida por Coolify. Nesse regime, o gargalo do desenvolvimento é o **humano no meio do loop**, não o risco de um deploy ruim que o health-check reverte.

Mas o LUC difere de um portfólio de dados descartáveis num ponto decisivo: **o dado é real e irreplicável.** São os pagamentos, a saúde e a vida administrativa de duas pessoas reais — não um catálogo reproduzível a partir do repo. Um deploy ruim se reverte; um banco de produção apagado, não. A autonomia precisa ser total na *operação* e cuidadosa com o *dado*.

## Decisão

**O agente opera com autonomia total sobre tudo que é escopo do projeto.** Implementar, fatiar em issues, criar/dropar o próprio app/DB/recurso no Coolify, deploy, redeploy, restart, env vars, segredo gerável por máquina (gera e seta via MCP, nunca commita), migration aditiva/reversível, registro DNS na zona própria, e **merge de PR verde** — tudo é a **norma**: faz sozinho, calado, sem reafirmar autonomia.

O agente **para e chama o operador em exatamente quatro casos** — nenhum por algo ser "arriscado" ou "irreversível":

1. **Trancaria o operador pra fora.** Senha root/painel, credencial de acesso, qualquer regra de firewall, ou rotacionar o token de infra que o próprio MCP usa. O agente serraria o galho onde se senta.
2. **Recriaria o substrato.** Destruir ou recriar a VM. O agente opera *em cima* da VPS; recriá-la é mexer na camada de baixo dele.
3. **Exige um terceiro que o agente não pode ser.** `client_secret` do OAuth Google ([ADR-0004](0004-lockdown-allowlist-oauth-google.md)), API key paga emitida num console. Faz toda a parte sem o segredo, documenta o passo exato, e entrega.
4. **Tocaria outro projeto no Coolify compartilhado.** O painel enxerga os projetos irmãos (ex.: panlabs, ethitorial); um `delete`/`drop` no alvo errado derruba o vizinho. Antes de qualquer operação que muta, o agente confirma que o recurso é do LUC. Havendo ambiguidade de escopo, para.

**Na dúvida sobre cair num dos quatro, para. Fora deles, faz.**

### Cláusula de dado: a produção do casal é irreplicável

Acima dos quatro casos operacionais, uma proteção específica do LUC: **destruir dado real de produção pausa.** Concretamente — `drop`/wipe do Postgres com dados reais, deletar o volume do banco, ou rodar uma **down-migration destrutiva contra produção** (que descarta coluna/tabela com dado). Não é por reversibilidade — é porque o operador **não recupera**: ao contrário de um deploy, não há `redeploy` que traga de volta um histórico de pagamentos apagado.

Isto **não** trava o desenvolvimento: migration aditiva, migration reversível, deploy, redeploy, restart, recriar o *app* (não o DB com dados) seguem AFK. Só a destruição do dado em si pausa — e **relaxa assim que houver backup automatizado do Postgres** (a partir daí, restaurável = AFK). Até lá, na ausência de backup, o dado de produção é tratado como o ativo insubstituível que é.

## Justificativa

- **Autonomia é o produto, não o risco — na operação.** Sem usuários externos, o custo de o agente parar para perguntar a cada operação reversível excede o custo de um deploy ruim que se reverte. A fronteira certa não é "o que é irreversível", é **"o que o agente não pode desfazer nem o operador recuperar fácil"**.
- **Esse mesmo teste é o que protege o dado.** Aplicado ao LUC, o teste captura uma coisa a mais que num portfólio descartável: o dataset de produção. Mesma régua, premissa de dado diferente — por isso a cláusula de dado, e por isso ela some quando o backup entra.
- **Classificar pelo efeito, não pela tool.** Os catálogos de MCP mudam; os quatro casos + a cláusula de dado valem para qualquer tool nova sem reescrever este ADR.

## Consequências

- Um agente novo lê o [CLAUDE.md](../../CLAUDE.md) + este ADR e sabe, sem perguntar, que pode tocar quase tudo sozinho — os quatro pontos onde para, e a única coisa que protege com cuidado extra (o dado de produção, até haver backup).
- **Backup automatizado do Postgres vira prioridade de infra:** é o que converte a cláusula de dado de "pausa" para "AFK". Enquanto não existir, o agente não roda destruição de dado de produção sozinho.
- Blast radius compartilhado na VPS (panlabs); o caso 4 (mira) impede o acidente cross-project.

## Gatilhos de reabertura

- O LUC ganhar **mais de um operador** — autonomia compartilhada muda o cálculo de blast radius; o merge volta a pedir review.
- A infra migrar para **VM dedicada por projeto** — o caso 4 muda de natureza.
- **Backup automatizado entrar no ar** — a cláusula de dado relaxa (restaurável = AFK); editar este ADR inline registrando a mudança.

## Opções rejeitadas

- **Autonomia literalmente sem freio (incluindo dado).** Um agente que apaga o histórico financeiro do casal sem backup não fica "mais autônomo" — destrói o produto. A cláusula de dado é o mínimo até o backup existir.
- **Gate humano em toda operação de produção.** Calibrado para um risco que não é o atual (sem usuários externos); trata deploy reversível como perigo. O merge verde + health-check é a aprovação real.
- **Semáforo por reversibilidade (🟢🟡🔴).** Trata barulho como perigo e cobra pergunta a cada operação reversível; o eixo certo é capacidade/recuperabilidade, não reversibilidade.
