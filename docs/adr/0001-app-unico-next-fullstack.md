# ADR 0001 — App único Next.js full-stack; o LUC é operado de dentro, com o banco como sistema de registro

- **Status:** Superseded by [ADR-0014](0014-backend-python-fastapi.md)
- **Data:** 2026-06-26
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0003](0003-nucleo-dominio-multi-borda.md) (o núcleo de domínio vive dentro deste app), [ADR-0006](0006-faseamento-por-areas.md) (faseamento), [CONTEXT.md](../../CONTEXT.md) (intro + Fronteira de escopo)

## Contexto

O scaffold deste repo foi portado de outro projeto (travelmanager) e trazia um monorepo de dois deployables: `apps/web` (Next.js) + `apps/api` (FastAPI/Python), com Alembic, SQLAlchemy e arquitetura hexagonal em Python. O LUC, porém, é um app pessoal, fechado para duas pessoas ([ADR-0002](0002-lar-acesso-simetrico.md)/[ADR-0004](0004-lockdown-allowlist-oauth-google.md)), sem superfície pública de API e sem necessidade de escalar front e back independentemente.

Também é preciso fixar a natureza do produto: diferente de projetos onde o conteúdo é versionado no git (ex.: o ethitorial serve posts de `content/**/*.mdx`), no LUC todo dado é fruto de um ato do usuário no portal — cadastrar uma Conta, dar baixa num pagamento, registrar um peso. Não há "conteúdo" a versionar; há fatos do Lar.

Opções consideradas:

1. Manter o monorepo Next + FastAPI (dois deployables, contrato OpenAPI entre eles).
2. App único Next.js full-stack (App Router: Server Components, Server Actions e Route Handlers), Postgres atrás.

## Decisão

**Adotar app único Next.js full-stack** (App Router), com a lógica de servidor em Server Actions/Route Handlers e **Postgres como sistema de registro**, acessado via Drizzle. Aposentar `apps/api` (FastAPI/Alembic/SQLAlchemy/hexagonal-Python) — ele sai do repo.

**O LUC é operado inteiramente de dentro.** Todo dado nasce de uma ação na interface e vive no banco; **nada de uso do produto é versionado em git**. O git guarda código e documentos de projeto (ADRs, CONTEXT.md), nunca artefatos de uso (Contas, Lançamentos, Tarefas).

## Justificativa

- **Uma linguagem, um deployable.** Sem fronteira HTTP interna entre dois runtimes, uma mudança que toca schema→domínio→UI é um PR coerente, em TypeScript ponta a ponta. O contrato OpenAPI do monorepo era custo sem nenhum consumidor externo que o justificasse.
- **Não há API pública a servir.** App fechado para duas pessoas; a única borda além da UI é futura (WhatsApp/OCR — [ADR-0003](0003-nucleo-dominio-multi-borda.md)), e Route Handlers cobrem isso sem um serviço à parte.
- **O domínio não exige Python.** A hexagonal-Python do scaffold era peso herdado; o boundary de domínio que importa preservar é portável pra TS ([ADR-0003](0003-nucleo-dominio-multi-borda.md)).
- **Banco como sistema de registro casa com as invariantes.** "Persistir fatos, derivar interpretações" e "o Registro fotografa" (CONTEXT.md) pressupõem um store transacional de fatos — não arquivos versionados. Git-como-CMS seria o modelo errado: fatos do Lar não têm o ciclo de revisão/branch de um conteúdo editorial.

## Consequências

- **Positivas:** stack única (TS/Next/Drizzle/Postgres); menos infra (um container + um Postgres no Coolify); deploy e CI mais simples.
- **Negativas:** servidor e cliente compartilham um runtime — a disciplina de "o que roda no servidor" passa a ser convenção (Server Components/Actions), não uma fronteira de processo. Mitiga-se com o núcleo de domínio do [ADR-0003](0003-nucleo-dominio-multi-borda.md).
- **Limpeza do scaffold (feita):** não havia `apps/api` em disco — o scaffold veio só como docs+config; os workflows de CI foram reescritos para o app único do LUC.

## Opções rejeitadas

- **Monorepo Next + FastAPI.** Dois runtimes, contrato OpenAPI e deploy duplo — todo o custo de coordenação de um sistema distribuído sem nenhum usuário externo, escala independente ou time separado que o pague.
- **Git como store de dados (à la CMS-MDX).** Funciona para conteúdo editorial versionável; é o modelo errado para fatos transacionais de uso (pagamentos, métricas), que precisam de query, agregação e escrita concorrente dos dois.
