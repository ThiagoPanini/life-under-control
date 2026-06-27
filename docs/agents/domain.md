# Docs de domínio

Como as skills de engenharia (`improve-codebase-architecture`, `diagnosing-bugs`, `tdd`, `grill-with-docs`) devem consumir a documentação de domínio deste repo ao explorar o código.

## Antes de explorar, leia

- **`CONTEXT.md`** na raiz — glossário de domínio (pt-BR) + invariantes. Repo **single-context** (sem `CONTEXT-MAP.md`).
- **`docs/adr/`** ([índice](../adr/README.md)) — leia as ADRs que tocam a área em que você vai mexer.

Se algum desses não existir, **siga em silêncio** — não sinalize ausência nem proponha criar de antemão. O `/domain-modeling` (alcançado via `/grill-with-docs` e `/improve-codebase-architecture`) cria sob demanda quando termos ou decisões realmente se resolvem.

## Use o vocabulário do glossário

Ao nomear um conceito de domínio (título de issue, proposta de refactor, hipótese, nome de teste), use o termo como definido no `CONTEXT.md`. **Respeite os termos proibidos** lá listados — não derive para sinônimos que o glossário evita. Convenção do repo: termo de domínio em pt-BR; identificador de código em inglês.

Se o conceito ainda não está no glossário, isso é um sinal: ou você está inventando linguagem que o projeto não usa (reconsidere), ou há uma lacuna real (anote para o `/domain-modeling`).

## Sinalize conflito com ADR

Se sua saída contradiz uma ADR existente, explicite em vez de sobrescrever em silêncio:

> _Contradiz a ADR-0003 (núcleo multi-borda) — mas vale reabrir porque…_
