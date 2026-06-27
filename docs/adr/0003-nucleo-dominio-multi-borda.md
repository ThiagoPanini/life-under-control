# ADR 0003 — Núcleo de domínio multi-borda (hexagonal leve em TypeScript)

- **Status:** Accepted
- **Data:** 2026-06-26
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0001](0001-app-unico-next-fullstack.md) (vive dentro do app único), [ADR-0005](0005-primitivos-descritivos-spine-especializacao.md) (o núcleo abriga os primitivos), [CONTEXT.md](../../CONTEXT.md)

## Contexto

Aposentados o `apps/api` e a hexagonal-Python ([ADR-0001](0001-app-unico-next-fullstack.md)), resta decidir como organizar a lógica dentro do app Next. O risco do full-stack Next é diluir a regra de domínio em componentes e handlers — cada Server Action falando SQL direto, regra espalhada na UI.

Ao mesmo tempo, o LUC tem uma ambição declarada de **múltiplas bordas de entrada** além da UI: um bot de WhatsApp ("dá baixa no boleto do condomínio de julho"), OCR de boleto, importação de extrato (CONTEXT.md, Fronteira de escopo). Se a regra mora na UI, cada borda nova reimplementa tudo.

## Decisão

**Um núcleo de domínio em TypeScript, isolado das bordas — hexagonal "leve".** As operações de domínio (criar Conta, dar baixa num pagamento, projetar a Agenda) vivem em **use-cases** puros que dependem de **ports** (interfaces), não de Drizzle, Next ou HTTP. Adapters concretos (repositório Postgres, relógio) implementam os ports.

As **bordas são finas e plugam no mesmo núcleo**: a UI (Server Actions/Components) hoje; amanhã um Route Handler de webhook (WhatsApp), um pipeline de OCR, um importador. Toda borda chama os mesmos use-cases.

"Leve" = sem a cerimônia da hexagonal-Python anterior (sem camadas `domain/application/adapters` formais por toda parte): a separação que se preserva é **núcleo-puro vs. borda**; a granularidade interna acompanha a necessidade, não um dogma.

## Justificativa

- **A multi-borda é a razão de ser.** O valor do bot de WhatsApp depende de "dar baixa num pagamento" ser uma operação chamável sem uma tela. Isso só é barato se a operação já existe como use-case desacoplado da UI. O núcleo é o que torna as bordas futuras ([ADR-0001](0001-app-unico-next-fullstack.md), CONTEXT.md) baratas em vez de uma reescrita.
- **Preserva o instinto certo do scaffold sem o peso.** A hexagonal-Python separava domínio de infra — bom instinto. Em TS, num app só, a mesma proteção custa muito menos: interfaces + funções puras, sem um runtime à parte.
- **Testabilidade.** Use-cases puros testam com fakes dos ports (sem banco), como o scaffold já fazia em Python — instinto que migra para TS.

## Consequências

- **Positivas:** regra de domínio num lugar, falável pelo vocabulário do CONTEXT.md; bordas novas são adapters, não reescritas; testes de domínio rápidos.
- **Negativas:** disciplina exigida — num app Next é tentador chamar o banco direto de uma Server Action. Sem revisão, o núcleo vaza. Mitiga-se com a convenção "borda nunca fala com o store; fala com use-case".
- O *layout de pastas* concreto (onde moram use-cases, ports, adapters) é detalhe de implementação a firmar no primeiro código — este ADR fixa o princípio (núcleo isolado, bordas finas), não a estrutura de diretórios.

## Opções rejeitadas

- **Regra direto nas Server Actions / "Next-native".** Mais rápido para a primeira tela, mas amarra cada operação a um contexto de request HTTP/React — e a primeira borda não-UI (WhatsApp) vira reescrita. Contradiz a ambição multi-borda.
- **Hexagonal pesada portada do Python (camadas formais em toda feature).** A pureza não paga seu custo num app pessoal full-stack TS; é a cerimônia que o [ADR-0001](0001-app-unico-next-fullstack.md) quis justamente soltar.
