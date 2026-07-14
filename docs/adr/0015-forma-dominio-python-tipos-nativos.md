# ADR 0015 — Forma do domínio Python: funções puras sobre tipos nativos; value object próprio só para conceito composto

- **Status:** Accepted
- **Data:** 2026-07-13
- **Decisores:** Thiago Panini (solo), em grilling com o agente
- **Relacionado:** [ADR-0014](0014-backend-python-fastapi.md) (o split e o estilo geral que este detalha), [ADR-0003](0003-nucleo-dominio-multi-borda.md) (núcleo hexagonal), [ADR-0005](0005-primitivos-descritivos-spine-especializacao.md) (primitivos *ontológicos* — assunto distinto da forma de tipos deste ADR), [CONTEXT.md](../../CONTEXT.md) (invariantes #3 e #6), skill local `clean-ddd-hexagonal` (referência confrontada)

## Contexto

A #187 (PR #206) portou o kernel `shared` do TS 1:1: funções soltas sobre primitivos — `int` centavos para dinheiro, `str` ISO para datas civis. O grilling de padrões questionou a forma: isso é primitive obsession a corrigir com value objects (`Money`, `CivilDate`), como manda o default DDD (a skill `clean-ddd-hexagonal` traz `Money` como o VO canônico)? E uma camada `domain/` sem entidades é domínio de verdade?

Dois achados destravaram a decisão. Primeiro: as invariantes não mandam representação — o #6 exige *exatidão em BRL* (não "int sem wrapper") e o #3 exige *fatos persistidos, interpretações derivadas* (não "str ISO"); a forma era decisão aberta, não consequência documentada. Segundo: o `str` ISO do TS é defesa contra o `Date` quebrado do JS (que mistura instante com data civil); portá-lo para Python — que tem `datetime.date`, o tipo exato do conceito — seria portar a muleta junto com a perna.

## Decisão

**1. Dinheiro permanece funções puras sobre `int` centavos.** Sem classe `Money`, sem `NewType` por ora. A int-ness segue garantida em runtime (guarda) e em tipo (pyright strict).

**2. Datas civis trocam `str` ISO por `datetime.date` em todas as assinaturas do domínio.** Validação vira parse na borda ("parse, don't validate"): o predicado de validade de string morre e nasce `parse_iso_date(text) -> date | None`; `Clock.today() -> date`. **Competência permanece `str` `"YYYY-MM"`** (não há tipo stdlib para ano-mês); assimetria aceita.

**3. Regra geral de forma, válida para todo o `apps/api`:** tipo semântico nativo da plataforma quando ele existe (`date`); primitivo mandatado quando a representação é contrato de ponta a ponta (`int` centavos — coluna, JSON, lado TS); value object próprio (`dataclass(frozen=True)`) só quando o conceito é composto e tem comportamento — e aí mora no contexto, não no kernel.

**4. Sem base classes de DDD** (`Entity`, `AggregateRoot`, `ValueObject` genéricos, como scaffolda a skill): dataclasses stdlib + funções, reafirmando o [ADR-0014](0014-backend-python-fastapi.md).

## Justificativa

Datas → `date`: (a) data inválida vira *irrepresentável* — a classe de bug "string torta circulando até explodir longe" morre por construção; (b) em Python as bordas são date-nativas (psycopg3 devolve `date` de coluna `DATE`; pydantic serializa `date`↔ISO de graça) — quem pagaria imposto de conversão é a string, o inverso do TS; (c) o domínio precisará de aritmética de datas (o Estado do mês deriva "vence em breve" = vencimento a ≤4 dias), e com `str` o código parsearia por dentro de qualquer jeito; (d) a janela é agora: 48 testes no kernel hoje, centenas de assinaturas depois que os contextos portarem. Bônus: `datetime.date` satisfaz item a item o checklist de value object (imutável, sem identidade, igualdade por valor, self-validating, métodos puros) — a troca *é* a adoção de um VO, fornecido pela stdlib.

Dinheiro sem VO: as motivações do `Money` canônico não existem no LUC — (a) a guarda de moeda mista é peso morto num domínio mono-moeda *por invariante* ("sempre em BRL"); (b) o invariante `amount >= 0` do VO de livro seria **errado** aqui (formatar negativo é legítimo; a recusa de negativo é regra contextual do parse — "negativo não é uma baixa"); (c) o kernel não faz aritmética de dinheiro (soma de baixas fracionadas é do contexto, e soma de `int` é exata por construção). Do VO sobraria apenas distinção de tipo — adiada (ver gatilhos). Funções são forma canônica de domain service em Python (Percival & Gregory modelam `allocate()` como função de módulo), e `int` centavos de ponta a ponta é o precedente da API canônica de dinheiro (Stripe).

## Consequências

- **Positivas:** o kernel lê como política de domínio (assinaturas `date` em vez de string-munging); bordas passam direto (pydantic/psycopg3); uma classe inteira de bug morta por tipo; regra de forma única e ensinável (vai para a skill `panlabs-python-standards`).
- **Negativas, aceitas de olhos abertos:** as fatias futuras do porte traduzem literais de data nos testes do oráculo (`"2026-07-06"` → `date(2026, 7, 6)`) — mecânico e local; o gate de paridade do ADR-0014 é *semântico*, não textual. Assinaturas divergem do TS durante a coexistência (o contrato entre os lados é JSON, indiferente à representação interna).
- A migração do código já mergeado de #187 (renames + retipagem) vira issue própria, junto com o [ADR-0016](0016-ingles-codigo-apps-api.md).

## Opções rejeitadas

- **`Money` VO (default da skill DDD).** As três motivações do padrão não existem no LUC (mono-moeda, sinal contextual, sem aritmética no kernel); viraria imposto de embrulha/desembrulha em toda borda.
- **`NewType("Cents", int)`.** Distinção de tipo real, mas cerimônia de wrapping em todo literal e call site; adiado até doer (ver gatilhos).
- **`CivilDate` VO próprio.** Redundante: `datetime.date` já é o VO, com parsing, aritmética e ordenação de graça.
- **Manter `str` ISO (fidelidade textual ao TS).** Fidelidade que o gate não exige; cristalizaria a muleta do JS em centenas de assinaturas Python.
- **`Decimal` para dinheiro.** Exato, porém diverge do contrato `int` centavos de ponta a ponta (coluna, JSON, TS) sem ganho.

## Gatilhos de reabertura

- Bug real de confusão de unidade monetária (centavos × outra grandeza `int`): introduzir `NewType`.
- Competência ganhar comportamento próprio quando Finanças portar: promover a VO no contexto `finance`.
