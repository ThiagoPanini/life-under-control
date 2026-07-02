# Architecture Decision Records (ADRs)

Decisões arquiteturais relevantes do LUC. Formato: MADR simplificado (ver [`.agents/skills/grill-with-docs/ADR-FORMAT.md`](../../.agents/skills/grill-with-docs/ADR-FORMAT.md)).

Um ADR se justifica quando a decisão é **difícil de reverter**, **surpreende sem o contexto** e tem **trade-off real**. Regra de domínio sem trade-off vira invariante no [CONTEXT.md](../../CONTEXT.md); convenção ou comando vai no [CLAUDE.md](../../CLAUDE.md).

## Como criar um novo ADR

1. Copie o ADR mais recente como template.
2. Numere sequencialmente: `NNNN-titulo-em-kebab.md`. O conjunto é contíguo, sem buracos.
3. Status inicial: `Proposed`. Mude para `Accepted` quando a decisão estiver firmada.
4. Inclua o essencial: contexto, decisão, justificativa, consequências. Opções rejeitadas e gatilhos de reabertura quando agregarem.
5. Linke o ADR de onde for relevante (CONTEXT.md, CLAUDE.md, outros ADRs).

## Quando criar ADR vs documentar de outra forma

| Situação | Onde documentar |
|---|---|
| Mudança que afeta a forma do sistema ou tem trade-off de longo prazo | **ADR** |
| Novo termo de domínio ou mudança em invariante | `CONTEXT.md` |
| Convenção de código, comando local ou regime de trabalho | `CLAUDE.md` / `docs/agents/` |
| Bug fix ou feature sem implicação arquitetural | Mensagem de commit + PR |

## Como revisar um ADR existente

Para um **refinamento** (a decisão segue válida, muda um detalhe), edite o ADR no lugar e registre a mudança inline com data e o quê/porquê. Para uma **reversão** de fundo, escreva um novo ADR que declare a decisão nova e marque o anterior como `Superseded by NNNN`. O git history é a trilha de auditoria — o conjunto na árvore fica enxuto e reflete o que vale hoje.

## Lista

- [0001 — App único Next.js full-stack; operado de dentro, banco como sistema de registro](0001-app-unico-next-fullstack.md)
- [0002 — O Lar é a unidade de dados, com acesso simétrico](0002-lar-acesso-simetrico.md)
- [0003 — Núcleo de domínio multi-borda (hexagonal leve em TS)](0003-nucleo-dominio-multi-borda.md)
- [0004 — Lockdown: allowlist de dois + OAuth Google, sem auto-cadastro](0004-lockdown-allowlist-oauth-google.md)
- [0005 — Primitivos descritivos (spine + especialização por Área)](0005-primitivos-descritivos-spine-especializacao.md)
- [0006 — Faseamento por Áreas: cara completa, ativação uma a uma](0006-faseamento-por-areas.md)
- [0007 — Autonomia total do agente, com o dado do casal protegido](0007-autonomia-total-do-agente.md)
- [0008 — Comprovantes (Anexos) em object storage S3-compatível (Cloudflare R2), via port](0008-anexos-object-storage-r2.md)
- [0009 — Assunto: nível estrutural dentro da Área, unidade de especialização dos primitivos](0009-assunto-nivel-estrutural-especializacao.md)
- [0010 — Gráficos financeiros em visx, revertendo a postura "SVG puro sem lib de chart"](0010-visx-para-graficos.md)
