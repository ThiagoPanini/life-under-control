# ADR 0016 — Inglês integral no código do `apps/api` (override escopado do repo pt-BR)

- **Status:** Accepted
- **Data:** 2026-07-13
- **Decisores:** Thiago Panini (solo), em grilling com o agente
- **Relacionado:** [ADR-0014](0014-backend-python-fastapi.md) (revisado por este: docstrings e nomes de pacote), [ADR-0015](0015-forma-dominio-python-tipos-nativos.md) (forma do domínio, migrado na mesma issue), [CONTEXT.md](../../CONTEXT.md) (o glossário é a ponte pt-BR↔inglês), [CLAUDE.md](../../CLAUDE.md) e [docs/agents/domain.md](../agents/domain.md) (emendados com o escopo)

## Contexto

O repo é pt-BR por regra "não negociável" (prosa, comentários, copy, commits), com identificador de código em inglês via mapa do glossário. Na prática, o primeiro Python (#187) nasceu misto: `format_brl` ao lado de `centavos_para_campo`, `Clock.hoje()`, cenários de teste em pt-BR — o inglês dos termos mapeados convivendo com o pt-BR dos helpers no mesmo módulo.

O [ADR-0014](0014-backend-python-fastapi.md) declarou o `apps/api` como lab-referência de Python e matéria-prima da skill `panlabs-python-standards`, transferível aos demais projetos do dono e discutível em fóruns internacionais. Uma skill de padrão pessoal que assume prosa pt-BR dentro do código não viaja; e código meio-a-meio é o pior estado — nem fiel ao repo, nem padrão de mercado.

## Decisão

**No `apps/api`, todo artefato de código é em inglês:** identificadores (inclusive helpers e constantes), docstrings, comentários, nomes de teste (`test_<scenario>_<expected>`), mensagens de exceção e de log.

A fronteira exata do override:

| Artefato | Língua |
|---|---|
| Código do `apps/api` (identificadores, docstrings, comentários, testes, exceções, logs) | inglês |
| Copy de produto emitida pelo `apps/api` (mensagens do bot WhatsApp ao casal, texto de erro que chega à UI) | pt-BR — é produto, não código; montada na borda |
| Commits, PRs, issues, ADRs, `CONTEXT.md`, `docs/` | pt-BR (a regra do repo segue valendo) |
| `apps/web` (comentários, cenários de teste TS) | pt-BR como está (hard-freeze; o backend TS morre no cutover) |

**Nomes de pacote de contexto em inglês:** `shared/`, `identity/`, `finance/`, `whatsapp/` — revisão inline no ADR-0014, que os fixara como `identidade/`/`financas/`. Ajustado agora, antes de os pacotes existirem.

**Regra-ponte com a linguagem ubíqua:** identificador de termo de domínio usa a coluna inglesa do glossário (Competência → `ReferencePeriod`, nunca transliteração); docstring que *define* um conceito de domínio cita o termo pt-BR uma vez (ex.: `"""Payment (Lançamento): ..."""`). O glossário é o tradutor oficial entre a conversa (pt-BR) e o código (inglês).

## Justificativa

- A moeda é a mesma do ADR-0014 (portfólio/skill): o valor transferível dos artefatos exige a língua da comunidade Python.
- É aproximação, não afastamento, da regra já escrita: "identificador de código em inglês" passa a valer para *todo* identificador, não só para os termos do mapa.
- A linguagem ubíqua não se perde — muda de veículo: o mapa do glossário já era o contrato termo↔identificador; a docstring citando o termo pt-BR mantém a ponte auditável.

## Consequências

- **Positivas:** código uniforme e padrão de mercado; skill portátil; fim do code-switch dentro do mesmo módulo.
- **Negativas, aceitas de olhos abertos:** a rastreabilidade *nome-a-nome* dos testes TS↔Python morre — a conferência de paridade do porte passa a ser **posicional** (as fatias preservam a ordem dos casos no arquivo; um teste por caso, sem `parametrize` no porte). Split-brain temporário com o backend TS (pt-BR) até o cutover; com a UI TS, vira seam permanente e documentado.
- Emendas executadas junto deste ADR: CLAUDE.md (a regra pt-BR ganha a exceção), domain.md (nome de teste pt-BR restrito ao `apps/web`), revisão inline no ADR-0014 (docstrings "Google pt-BR" → inglês; nomes de pacote).
- A migração do código de #187 (renames) vira issue própria, junto com o [ADR-0015](0015-forma-dominio-python-tipos-nativos.md).

## Opções rejeitadas

- **Manter cenário de teste em pt-BR (só o resto em inglês).** Preservaria o grep nome-a-nome com o oráculo TS, mas deixaria uma ilha pt-BR dentro de código inglês — o estado misto que este ADR existe para eliminar.
- **Full-English no repo inteiro (commits, issues, docs).** O produto é pt-BR (casal brasileiro) e a prosa de repo é ferramenta de fluência do dono; nada a ganhar.
- **Transliteração de termos de domínio (`competencia` com grafia "inglesa").** Quebra o glossário — a coluna inglesa do mapa existe exatamente para isso.
