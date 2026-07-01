# CLAUDE.md

> Repositório em **pt-BR** (prosa, comentários, copy de UI, commits).

**Life Under Control (LUC)** — organizador da vida adulta de um **Lar** (um casal com acesso idêntico aos mesmos dados). Um cockpit com as Áreas da vida (Finanças, Saúde, Carro…), operado inteiramente de dentro do portal. App único Next.js full-stack + Postgres. Estado: **pré-protótipo** — `CONTEXT.md` e ADRs estabelecidos; a implementação começa após o protótipo no Claude Design. Faseamento por Áreas ([ADR-0006](docs/adr/0006-faseamento-por-areas.md)).

## Autonomia (regra de ouro)

**Você opera com autonomia total sobre tudo que é escopo do projeto** — implementar, deploy/redeploy, env, gerar segredo que a máquina gera, migration aditiva, criar/dropar recurso próprio no Coolify e **mergear PR verde**. É a norma; faça sozinho, sem reafirmar autonomia a cada vez.

**Pare e chame o operador em exatamente 4 casos** — se a operação (1) **te trancaria pra fora** (root/painel, credencial de acesso, firewall, ou rotacionar o token do próprio MCP); (2) **recriaria o substrato** (destruir/recriar a VM); (3) **exige segredo de terceiro** que você não tem como ser (`client_secret` do OAuth Google, API key paga); ou (4) **tocaria outro projeto** no Coolify compartilhado (disciplina de alvo). **Na dúvida sobre cair num dos quatro, pare. Fora deles, faça.**

**Cláusula de dado:** o LUC guarda dado real e irreplicável do casal. Destruir dado de produção (dropar/wipe do Postgres com dados, down-migration destrutiva em prod) **pausa** — não por reversibilidade, mas porque o operador não recupera. Relaxa quando houver backup automatizado. Porquê e premissa em [ADR-0007](docs/adr/0007-autonomia-total-do-agente.md).

## Modo de implementação autônoma

Disparado por "implementa as issues" (ou equivalente): colete as issues `status:ready-for-agent` abertas (sem `status:blocked`) da Área corrente → um **git worktree por issue** → skill /tdd (RED→GREEN→refactor) → commit + push (Conventional Commits) → a esteira `pr-checks` abre o PR → **mergeie no verde** → encadeie até as issues acabarem, **parando só se o operador pedir** (ex.: compactar contexto). Fluxo completo em [`docs/agents/workflow.md`](docs/agents/workflow.md).

**Economia de contexto (enforçada por hooks):** toda implementação delega o reconhecimento do código a um subagente `Explore` e age só sobre o digest — não relê a árvore. Dois hooks do projeto cuidam disso: o injetor (`UserPromptSubmit`) injeta o protocolo no gatilho (`/implement`, "implementa as issues") e a trava (`PreToolUse`/Read) bloqueia releitura de output cru. Protocolo em `.claude/context-economy-protocol.md`; porquê e runbook de promoção em [`docs/agents/workflow.md`](docs/agents/workflow.md).

## Fonte-da-verdade — leia antes de trabalho substantivo

1. **`CONTEXT.md`** — glossário de domínio + invariantes (núcleo estável) e o catálogo de primitivos (fronteira provisória). Código que viola invariante é bug.
2. **`docs/adr/`** ([índice](docs/adr/README.md)) — decisões e seus porquês. Não leia todos os ADRs, apenas saiba o que existe.

O sistema visual oficial do LUC está em [`docs/design/`](docs/design/README.md). Esse contrato vivo governa tokens, tipografia, componentes, casca, estados e vocabulário; os protótipos do Claude Design são sua origem visual, não uma dependência de execução do repo.

## Convenções (não negociáveis)

- Termo de domínio em pt-BR; **identificador de código em inglês** (mapa no glossário do `CONTEXT.md`). Respeite os termos proibidos lá listados.
- **Markdown sem hard-wrap:** uma linha por parágrafo (quebra só *entre* parágrafos) — não corte frases em ~80 colunas; o soft-wrap é do editor. Quebra de linha só onde tem semântica: item de lista, linha de tabela, bloco de código. Vale pra todo `.md`, inclusive o escrito por agente.
- **Conventional Commits**, subject minúsculo (validado por commitlint).
- **Prompts:** quando o dono pedir "um prompt", salve em `prompts/` (nunca no scratchpad), nome `YYYYMMDDHHMMSS_slug-kebab-ptBR.md` — timestamp via `date +%Y%m%d%H%M%S`, slug curto em pt-BR; corpo em pt-BR começando por `# Título`, sem frontmatter. Diretório é local (gitignored).
- **Skills** moram em `.agents/skills/`, symlinkadas em `.claude/skills/` — fonte única; não duplique nem "dedupe".

## Arquitetura

App único **Next.js 15** (App Router) full-stack, TypeScript, **Postgres via Drizzle**, **Vitest** + **Biome**. Sem backend Python — a API FastAPI do scaffold foi aposentada ([ADR-0001](docs/adr/0001-app-unico-next-fullstack.md)). Todo dado nasce de um ato no portal e vive no banco; nada de uso é versionado em git.

- `apps/web/` — o app (Server Components / Server Actions / Route Handlers). O layout de pastas do núcleo firma no primeiro código ([ADR-0003](docs/adr/0003-nucleo-dominio-multi-borda.md)).

## Padrões de domínio (núcleo multi-borda — ADR-0003)

Ao tocar a lógica do LUC, considere:

- **Núcleo isolado das bordas.** Operações de domínio (criar Conta, dar baixa num pagamento, projetar a Agenda) vivem em **use-cases** puros que dependem de **ports** (interfaces), não de Drizzle/Next/HTTP. Adapters concretos implementam os ports.
- **Borda fina.** UI (Server Actions/Components) hoje; amanhã webhook de WhatsApp, OCR, importação — toda borda chama os **mesmos** use-cases. Borda nunca fala com o store direto; fala com use-case.
- **Primitivos descritivos, não schema fechado** ([ADR-0005](docs/adr/0005-primitivos-descritivos-spine-especializacao.md)). Tarefa/Registro/Métrica/Indicação/Gerador são spines genéricos; cada Área os especializa (Lançamento é-um Registro; Conta é o Gerador de Finanças). O catálogo cresce por Área — não crave ontologia universal a partir de uma Área só.
- **Persistir fatos, derivar interpretações** (CONTEXT.md). "Atrasado", juros, vencimento esperado são calculados, nunca colunas.
- **Dinheiro** = inteiro em centavos, BRL; nunca ponto flutuante (CONTEXT.md #6).
- **Testes:** use-case com fakes dos ports (sem DB); `Clock` port no lugar do relógio real. GWT (`given`/`when`/`then`), nome `test_<cenário>_<esperado>`.

Porquê: [ADR-0003](docs/adr/0003-nucleo-dominio-multi-borda.md) e [ADR-0005](docs/adr/0005-primitivos-descritivos-spine-especializacao.md).

## Comandos

```bash
# Web (da raiz) — app único TS. Pressupõem o app já criado; até o protótipo, o repo é docs+config.
pnpm --filter @luc/web dev                 # :3000
pnpm --filter @luc/web typecheck
pnpm --filter @luc/web test                # vitest
node_modules/.bin/biome check apps/web     # NÃO use `pnpm exec biome` (falso-verde)
```

## Gate

Workflow `pr-checks` (web: biome + typecheck + vitest · gitleaks). `main` é protegida → o `pr-checks` abre o PR no verde e o agente mergeia sozinho (merge autônomo — [ADR-0007](docs/adr/0007-autonomia-total-do-agente.md)). Os jobs pulam em verde enquanto `apps/web` ainda não existe.

## Agent skills

Config que as skills de engenharia (Matt Pocock) assumem por repo — detalhe em `docs/agents/`.

### Fluxo de desenvolvimento

Default grill → to-issues → tdd + **Modo de implementação autônoma** em [`docs/agents/workflow.md`](docs/agents/workflow.md).

### Issue tracker

Issues e PRDs vivem no GitHub Issues (`ThiagoPanini/life-under-control`, via `gh`); PRs externos **não** entram na triagem. Ver `docs/agents/issue-tracker.md`.

### Triage labels

Cinco papéis de triagem no namespace `status:` — `status:needs-triage` / `needs-info` / `ready-for-agent` / `hitl` (= ready-for-human) / `wontfix`. Família ortogonal `needs:` sinaliza pré-requisito de execução — `needs:mcp` quando a implementação executa um MCP de infra (Coolify/Cloudflare/Hostinger). Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` (glossário pt-BR + invariantes) + `docs/adr/` na raiz. Ver `docs/agents/domain.md`.
