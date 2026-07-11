# ADR 0014 — Backend em Python (FastAPI); o Next vira borda de UI. Supersede o app único do ADR-0001

- **Status:** Accepted
- **Data:** 2026-07-11
- **Decisores:** Thiago Panini (solo), em grilling com o agente
- **Relacionado:** [ADR-0001](0001-app-unico-next-fullstack.md) (superseded por este), [ADR-0003](0003-nucleo-dominio-multi-borda.md) (o núcleo hexagonal é preservado — portado, não redesenhado), [ADR-0007](0007-autonomia-total-do-agente.md) (autonomia na execução; cláusula de dado não é acionada), ADR-0005 do travelmanager (doutrina hexagonal pragmática de referência)

## Contexto

Grillings anteriores mantiveram o app único TS por ausência de benefício de produto — e essa premissa **continua verdadeira**: não há usuário externo, escala independente nem time separado. O que mudou foi a moeda: o dono decidiu pagar custo de produto com benefício de portfólio — fluência (Python é sua língua principal em todos os outros projetos), laboratório-referência de como construir aplicação grande em Python, e a skill `panlabs-python-standards` extraída desse padrão. Critério de decisão fixado no grilling: **melhores práticas de aplicação grande; a escala real (2 usuários) não pesa**.

Três fatos técnicos baratearam a reversão: o núcleo TS é puro por construção (7,9k LOC em domain/ports/use-cases, zero import de infra além de `node:crypto`); a suíte (~1.074 casos com fakes dos ports, nomenclatura `test_<cenário>_<esperado>`) serve de oráculo de paridade; e a borda WhatsApp está mergeada mas **sem tráfego do casal** (e2e HITL pendente, cutover do número travado em chip — #161), tornando a janela atual a mais barata que existirá.

## Decisão

**Split total**: nasce o `apps/api` — **Python 3.13+ / FastAPI / uv** — dono do domínio, dos ports/adapters e das bordas de servidor (webhook WhatsApp, cron do digest, API interna). O Next vira **borda de UI/BFF pura**: sem `DATABASE_URL`, sem adapters; Auth.js permanece nele.

Decisões técnicas do split, fixadas em grilling:

- **Async-first.** O núcleo TS já é async/await; o porte 1:1 preserva a estrutura: use-cases `async def`, ports `typing.Protocol` com métodos async, fakes async, pytest-asyncio.
- **Hexagonal pragmática do travelmanager, com uma divergência deliberada.** Ports como `Protocol` (nunca ABC), use-cases como `@dataclass(frozen=True, slots=True)` callable, pydantic só na borda, erros semânticos sem número HTTP + handler central, composition root manual (`provide_*`), fakes à mão, `FixedClock`. A divergência: **entidades puras** — `dataclass(frozen=True)` stdlib-only + funções de parse — em vez de "modelo ORM é a entidade". Regra registrada para a skill: ORM=entidade quando o domínio é CRUD-fino; entidade pura quando o domínio carrega invariantes (teste prático: a suíte do núcleo roda sem banco?).
- **Persistência: SQLAlchemy Core (async, psycopg3) + Alembic.** Repo concreto é anti-corruption layer com mapeamento Row↔entidade explícito; CAS cirúrgico (`update().where(estado == de).returning()`); N+1/lazy-load impossíveis por construção. As 13 migrações SQL existentes viram pré-história via baseline-stamp; `alembic upgrade head` no boot do container.
- **Auth: BFF + JWT interno curto.** O Next resolve a sessão Auth.js e minta um JWT HS256 por chamada (TTL ~60s; claims sub/household/iss/aud); uma dependency do FastAPI valida e injeta a identidade. Webhook (HMAC da Meta) e cron (Bearer) têm segredos próprios, sem sessão de usuário. `events.signIn` (espelho de avatar) vira chamada interna ao api.
- **Contrato: escritas use-case-shaped, leituras page-shaped.** Um endpoint por use-case nas escritas; as projeções `derive-*` viram endpoints de view-model por página (anti-N+1 sobre HTTP). Erros em `application/problem+json`. Sem versionamento (consumidor único); tipos pydantic→OpenAPI→`openapi-typescript` com gate de drift no CI.
- **Layout: feature-first por contexto** (`shared/`, `identidade/`, `financas/`, `whatsapp/`, cada um com domain/application/adapters) com fronteiras executáveis por **import-linter** no CI. Tooling: uv, ruff (set curado), **pyright strict**, src layout + hatchling, docstrings Google pt-BR.
- **Deploy: dois apps Coolify** no mesmo VPS. O api em subdomínio com allowlist de path no proxy — público só `/webhooks/*` e `/health`; todo o resto só pela rede privada (`luc-web → luc-api`). Imagem GHCR via Dockerfile multi-stage uv.
- **Caminho: "selvagem com dois gates".** Porte total sem tráfego; gates inegociáveis: (1) suíte 1:1 verde em pytest, (2) testes de adapter contra Postgres real no CI. Depois, cutover comprimido: webhook+digest direto (sem shadow — o e2e do operador valida a versão Python, uma vez só); portal por último, com smoke + rollback = redeploy da imagem TS. **Hard-freeze do backend TS** durante o porte (bugfix sim, feature nova não; UI livre). O TS do WhatsApp vira spec executável do porte — nunca chega ao casal como produto.

## Justificativa

- A moeda de portfólio é prerrogativa do dono num app pessoal; o ADR-0001 julgou (e acertou) apenas a moeda de produto.
- O shape final — TS no front, Python no back — é o stack default da indústria; como referência transferível vale mais que "app único Next", shape que o dono não pretende repetir.
- Núcleo puro + oráculo de ~1.074 testes tornam o porte mecânico e verificável; o schema Postgres **não muda** — é reescrita de código sobre o mesmo store, a cláusula de dado do ADR-0007 nem é acionada.
- A janela é única: depois que o WhatsApp entrar em uso real, todo cutover passará a ter tráfego a proteger.

## Consequências

- **Positivas:** lab-referência Python com constraints reais (dinheiro em centavos, CAS, compensações, HMAC de webhook); matéria-prima da skill `panlabs-python-standards`; fluência do dono sobre o código que sustenta.
- **Negativas, aceitas de olhos abertos:** a fronteira é perpétua — toda feature vertical futura cruza duas linguagens, um contrato interno e dois deployables; review poliglota; dois pipelines de CI.
- O repo é **poliglota pra sempre**: a UI (~8,8k LOC React/Mirante) permanece TS por decisão, não por inércia.
- CLAUDE.md, docs de agente e comandos precisam refletir o split conforme ele materializa.

## Opções rejeitadas

- **Manter TS (status quo).** Correto em moeda de produto; deixa as três metas de portfólio sem veículo.
- **Greenfield de referência.** Risco zero ao LUC, mas referência sem constraints reais — patterns não batalhados.
- **Satélite Python só nas bordas novas.** Dois runtimes donos do mesmo domínio nas mesmas tabelas = monólito distribuído; paga a fronteira sem aposentar o TS.
- **Strangler por fatia (porte+cutover por borda).** Invariantes duplicadas em duas linguagens com escrita concorrente nos mesmos aggregates durante janela longa.
- **ORM=entidade (travelmanager literal) e mapeamento imperativo (Cosmic Python).** O primeiro quebra a paridade 1:1 (suíte do núcleo passaria a exigir banco) e reintroduz N+1/lazy-load; o segundo exige entidade mutável (a instrumentação do ORM briga com `frozen`) por um benefício — grafos profundos — que o LUC não tem.
- **Python decriptar a sessão Auth.js / auth inteiro no Python.** O primeiro acopla o backend a internals não-contratuais do Auth.js (o HKDF já mudou v4→v5); o segundo reescreve o lockdown (ADR-0004) que funciona e faria do login do casal o maior risco do cutover.
- **gRPC no contrato interno.** Um consumidor só; REST+OpenAPI é o default e alimenta a geração de tipos TS de graça.

## Gatilhos de reabertura

- O gate de paridade não fechar (suíte 1:1 não estabiliza verde): parar e reavaliar — sem cutover parcial.
- A fronteira provar cara demais na prática (features verticais emperrando no contrato): reabrir a discussão de re-colapsar, com o aprendizado registrado.
