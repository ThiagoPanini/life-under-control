# Fluxo de desenvolvimento

O regime default deste repo — **não precisa ser reafirmado a cada sessão**. Resume a doutrina de autonomia ([ADR-0007](../adr/0007-autonomia-total-do-agente.md)) e o pipeline grill → issues → tdd.

## Autonomia (resumo)

O agente opera com **autonomia total sobre tudo que é escopo do projeto** — implementa, faz deploy/redeploy, mexe em env, gera segredo que a máquina gera, roda migration aditiva, cria/dropa recurso próprio no Coolify e **mergeia PR verde**. Faz sozinho, sem reafirmar autonomia a cada vez.

**Pare e chame o operador em exatamente 4 casos:** (1) te trancaria pra fora (acesso/root/painel/firewall, ou rotacionar o token do próprio MCP); (2) recriaria o substrato (destruir/recriar a VM); (3) exige segredo de terceiro que você não tem como ser (`client_secret` do OAuth Google, API key paga); (4) tocaria outro projeto no Coolify compartilhado. **Na dúvida sobre cair num dos quatro, pare; fora deles, faça.** Além disso, **destruir dado de produção pausa** até haver backup (cláusula de dado). Premissa e gatilhos de reabertura no [ADR-0007](../adr/0007-autonomia-total-do-agente.md).

## O fluxo

1. **`/grill-with-docs`** (ou `/grill-me`) — alinhe o plano e atualize `CONTEXT.md`/ADRs onde a decisão cristaliza.
2. **`/to-issues`** — fatie o plano da Área em issues tracer-bullet. Raramente **`/to-prd`** para features grandes, que depois são fatiadas.
3. **`/tdd`** — implemente RED→GREEN→refactor.

## Modo de implementação autônoma

Disparado por **"implementa as issues"** (ou equivalente). O agente está livre para, **sem pedir confirmação**:

1. **Coletar** as issues abertas elegíveis: `status:ready-for-agent`, da Área corrente, sem `status:blocked`.
2. **Um git worktree por issue** (branch `worktree/**` — a esteira `pr-checks` dispara nessas branches).
3. **`/tdd`** RED→GREEN→refactor; commits em Conventional Commits (subject minúsculo).
4. **Push** → o `pr-checks` roda os gates e, no verde, **abre o PR** automaticamente (job `open-pr`).
5. **Mergear no verde** — o gate verde é a aprovação; não há merge humano.
6. **Encadear** até as issues acabarem, **parando só se o operador pedir** (ex.: para compactar contexto).

A cadência de *Áreas* permanece de planejamento ([ADR-0006](../adr/0006-faseamento-por-areas.md)): *qual* Área ativar a seguir é decisão do operador; *dentro* das issues fatiadas, a execução é autônoma.

## Economia de contexto (enforçada por hooks)

Medições de `/implement` reais mostraram a janela chegando a 92-160k de tokens já no primeiro código — até 15-28k disso em Reads de arquivo inteiro evitáveis, uma vez **mesmo com um digest de 191 tokens já disponível**. O `gh issue view` de issues irmãs (3.5-4.6k) e a releitura de output cru de subagente (12.5k) se repetem sessão a sessão. O conserto é estrutural, não exortação.

**Disciplina (o protocolo injetado — `.claude/context-economy-protocol.md`):**

- **Delegue o reconhecimento.** Ao implementar, primeiro spawne um subagente `Explore` (escopo na Área) e peça um digest ≤2-3k: arquivos relevantes (path+porquê), padrão a espelhar, invariantes/ADR, seams p/ TDD. O digest é o **orçamento de leitura** — leia só o que ele nomeia, em fatias estreitas, e parta pro RED.
- **Issue enxuta.** Só a issue-alvo (`gh issue view N`, title/body/labels); sem irmãs, sem `--comments` salvo necessidade.
- **Não releia output cru.** `.output` de subagente e dumps de `tool-results/` de MCP já viraram digest — re-consulte a fonte com pergunta dirigida, não releia o dump.

**Enforcement (dois hooks do projeto, em `.claude/hooks/`):**

- **Injetor** (`UserPromptSubmit`): ao ver `/implement` ou "implementa as issues", injeta o protocolo no contexto do turno.
- **Trava** (`PreToolUse`/Read): bloqueia leitura inteira de paths que nunca valem a pena no implement — `.output`, `tool-results/`, lockfiles, `drizzle/meta/`, artefatos (`node_modules`/`dist`/`.next`/`*.min.*`). Leitura de código-fonte fica livre.

Ambos são **marker-gated** pelo arquivo `.claude/context-economy-protocol.md`: sem ele, são inertes. Isso permite **promover os scripts pro `~/.claude` global** (fonte única, sem drift) e cada repo opta-in só dropando o protocolo — sem duplicar o wiring (hooks de user e project mergeiam e disparariam 2×).

**Promoção pro global (quando validado no LUC):** (1) `cp .claude/hooks/*.py ~/.claude/hooks/`; (2) mova o bloco `hooks` de `.claude/settings.json` → `~/.claude/settings.json`; (3) **apague** o bloco `hooks` do `.claude/settings.json` do projeto (senão dispara 2×); (4) o LUC mantém o `context-economy-protocol.md` como override/marker; (5) cada outro repo opta-in dropando seu próprio `context-economy-protocol.md`. Scripts não mudam (já `${CLAUDE_PROJECT_DIR}`-relativos e marker-gated).

## Onde as coisas vivem

- Issues e PRDs: GitHub Issues — [`issue-tracker.md`](issue-tracker.md).
- Labels de triagem (incl. `status:ready-for-agent` / `status:hitl`): [`triage-labels.md`](triage-labels.md).
- Glossário + invariantes de domínio: [`../../CONTEXT.md`](../../CONTEXT.md) — como consumir em [`domain.md`](domain.md).
- Portões de CI, comandos e padrões: [`../../CLAUDE.md`](../../CLAUDE.md).
