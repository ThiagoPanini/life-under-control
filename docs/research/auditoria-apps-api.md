# Auditoria do padrão Python do `apps/api` (#221)

Auditoria honesta do backend Python do LUC — forças **e** fraquezas do padrão praticado, eixo a eixo. Alimenta adjudicação, não defende status quo.

- **Escopo:** `apps/api/src/luc_api` (`shared`, `finance`, `identity`, `whatsapp`, `http`, mais `main`/`composition`/`settings`/`health`), `apps/api/tests`, régua em `apps/api/pyproject.toml` e CI em `.github/workflows/pr-checks.yml`. Estado medido: 102 arquivos `.py` de fonte (~10.862 linhas), 63 arquivos de teste, 597 funções `test_`.
- **Método:** toda alegação carrega citação `arquivo:linha`. Marco **[fato]** o que li e **[interpretação]** o que infiro. Separo o que os ADRs 0014/0015/0016 ratificam do que é **prática emergente não ratificada**. Vigilância anti-cerimônia explícita onde houver ritual sem garantia.
- **Ponto cego declarado:** não executei a suíte nem o type-checker; a análise é de leitura estática do código e da configuração.

## 0. Achado transversal (leia primeiro): maturidade desigual núcleo × borda

O fato que condiciona todos os eixos: **o núcleo (domain/application/adapters) está portado e exaustivamente testado; a borda de servidor é quase inexistente.**

- **[fato]** O app FastAPI monta apenas dois roteadores: `/health` e `/me` (`src/luc_api/main.py:24-26`). Não existe nenhum roteador de `finance`, `whatsapp` ou operações de `identity` — `grep` de `APIRouter`/`@router` acha só `health.py` e `http/me.py`. Os use-cases de escrita (create_bill, record_payment, respond_to_proposal, send_due_digest…) não têm endpoint.
- **[fato]** O composition root expõe só `provide_clock` e `provide_settings` (`src/luc_api/composition.py:11`). Nenhum `provide_*` para os sete repos SQL, o R2 store, o messenger etc.
- **[fato]** `migrate_on_boot` existe e é testado (`src/luc_api/shared/adapters/db/migrate.py:44`), mas **não é chamado em lugar nenhum do runtime**: `grep` de `lifespan`/`on_event`/`startup` em `src` não retorna nada, e o `CMD` do Dockerfile é só `uvicorn` (`apps/api/Dockerfile:40`, cujo comentário na linha 39 ainda diz que a migração "arrives with persistence"). No boot real, as migrações não rodam.
- **[fato]** Vários ports têm **só fake, sem adapter concreto**: `Notifier` (`finance/application/notifier.py`), `WhatsappMessenger` (`whatsapp/application/whatsapp_messenger.py`), `DigestSendLog` (`finance/application/digest_send_log.py`), `ContaMatcher` (LLM/Bedrock, `whatsapp/application/conta_matcher.py`) e `Calendar` (`finance/application/calendar.py`, `whatsapp/application/calendar.py`). Os adapters que existem são só os SQL (`*/adapters/__init__.py`) e o `R2AttachmentStore`.
- **[interpretação]** O `apps/api` hoje é uma **biblioteca de domínio testada, não um serviço rodando**. Tudo além de liveness e do echo de identidade está portado mas desconectado de qualquer edge. Isso é coerente com o faseamento (ADR-0014 previa "porte sem tráfego"), mas precisa ser dito porque **infla a aparência de completude**: 597 testes verdes cobrem o núcleo, não um caminho ponta-a-ponta.

Esse achado tem consequência direta no eixo de conformidade (§4) e de DI (§6): a maior parte dos adapters nunca é ligada ao seu port em ponto nenhum, então a garantia estrutural que o padrão anuncia não está sendo colhida.

## 1. Mecanismo de contrato dos ports

**[fato]** Convivem **três** mecanismos distintos de "port":

1. **`typing.Protocol`** para repos e serviços com múltiplos métodos: `BillRepo` (`finance/application/bill_repo.py:45`), `PaymentRepo` (`.../payment_repo.py:23`), `AttachmentStore` (`.../attachment_store.py:22`), `Notifier` (`.../notifier.py:24`), `PaymentProposalRepo` (`whatsapp/application/payment_proposal_repo.py:71`), `WhatsappMessenger` (`.../whatsapp_messenger.py:34`), `WhatsappEventRepo` (`.../whatsapp_event_repo.py:14`), `DigestSendLog` (`finance/application/digest_send_log.py:16`), `UserRepo`/`HouseholdRepo` (`identity/application/*_repo.py`), `Clock` (`shared/application/clock.py:14`). Nunca ABC — ratificado pelo ADR-0014 (linha 21, "Ports como `Protocol` (nunca ABC)").
2. **`type` alias sobre `Callable`** para ports de uma operação: `ContaMatcher = Callable[[str | None, list[BillOption]], Awaitable[list[str]]]` (`whatsapp/application/conta_matcher.py:24`); mais os "mini-ports" injetados `new_id: Callable[[], str]` e `log: Callable[[str], None]` (`whatsapp/application/respond_to_proposal.py:194,196`).
3. **`@dataclass` "deps-bundle"** que agrega vários ports num só parâmetro: `DigestDeps` (`finance/application/send_due_digest.py:59`), `ResponderDeps`/`TextEditDeps`/`SweepDeps` (`whatsapp/application/respond_to_proposal.py:181,636,704`).

**Força:** Protocol é a escolha idiomática e estrutural certa para Python — adapter não precisa herdar nada, o domínio não conhece a implementação, e o teste dá um dublê à mão sem mock framework. A heterogeneidade é, em parte, **principiada**: o port de uma função é uma função (o matcher LLM), não uma classe cerimonial.

**Fraqueza / anti-cerimônia:** a mistura Callable-alias × Protocol não tem regra escrita — é escolha caso-a-caso, ainda pequena o bastante para caber na cabeça mas já sem doutrina. Nenhum ADR ratifica os deps-bundle nem o Callable-port. **[interpretação]** É prática emergente sã, mas emergente.

## 2. Onde os contratos moram e como são descobertos

**[fato]** Ports moram na **camada `application` do contexto**, no mesmo módulo que a operação-DTO e o fake correspondentes (ex.: `bill_repo.py` tem `NewBill`, `BillRepo` e reexporta `Bill`). São descobertos por **façade `__init__.py`** com docstring-mapa + `__all__` exaustivo: `finance/application/__init__.py` reexporta ~160 nomes (linhas 19-413); `whatsapp/application/__init__.py` e `identity/application/__init__.py` seguem o mesmo padrão com mapa em prosa no topo.

**Força:** o mapa-docstring em cada `__init__.py` é excelente para navegação — descreve o papel de cada módulo, não só lista. `__all__` explícito casa com o gate de estilo (ruff `D`, pylint) e dá superfície pública auditável.

**Fraqueza / anti-cerimônia:** o `__all__` de `finance/application` tem ~166 símbolos mantidos à mão (`finance/application/__init__.py:247-413`). **[interpretação]** É custo de manutenção real e um convite a drift (esquecer de listar). O façade colapsa port, DTO, fake e projeções de leitura numa só superfície pública plana — quem consome `from luc_api.finance.application import ...` recebe `Bill`, `FakePaymentRepo` e `derive_year_map` no mesmo nível, sem distinção entre contrato e dublê de teste (ver §5).

## 3. Granularidade dos ports (port gordo × ISP)

**[fato]** Coexistem os dois extremos, às vezes lado a lado:

- **Ports gordos:** `BillRepo` tem 9 métodos (`finance/application/bill_repo.py:48-82`); `PaymentProposalRepo` tem 14 (`whatsapp/application/payment_proposal_repo.py:74-162`), incluindo sete transições CAS distintas.
- **ISP deliberado:** `BillLister` é uma fatia de um método de `BillRepo`, com docstring "mirrors `Pick<BillRepo, "listarBills">`" (`whatsapp/application/respond_to_proposal.py:173`); `_ReOfferDeps` é um Protocol de duas propriedades compartilhado por dois deps-bundle (`.../respond_to_proposal.py:592`).

**Força:** onde o consumo é estreito (o whatsapp só lista Bills, não as edita), o código **corta o port** em vez de arrastar a interface gorda — ISP aplicado com intenção, e ainda tipado estruturalmente (o `ResponderDeps.bill_repo` é `BillLister`, não `BillRepo`).

**Fraqueza:** `PaymentProposalRepo` com 14 métodos, sete deles CAS quase-idênticos (`confirm`/`cancel`/`mark_expired`/`update_bill`/`update_reference_period`/`update_field`/`set_awaiting`), é um port gordo genuíno. **[interpretação]** É gordura herdada 1:1 do oráculo TS (parágrafo de justificativa no topo do módulo), não desenho fresco; funciona, mas nenhum consumidor usa os 14 — o `respond_to_proposal` usa um subconjunto por handler, e não há `Pick` aqui como há para `BillRepo`.

## 4. Conformidade adapter × contrato (o eixo mais frágil)

**[fato]** A `composition.py` declara, na própria docstring, o mecanismo de garantia: "The annotated return type is where pyright validates the adapter's structural adherence to the port" (`src/luc_api/composition.py:2-3`).

**[fato]** Esse pino de conformidade — uma anotação de retorno tipada com o Protocol — existe em **exatamente três lugares**, e um deles é um fake:
- `provide_clock() -> Clock` (`composition.py:14`) → `SystemClock`.
- `system_clock() -> Clock` (`shared/adapters/system_clock.py:26`) → `SystemClock` (duplicata do anterior).
- `r2_attachment_store() -> AttachmentStore` (`finance/adapters/r2_attachment_store.py:192`) → `R2AttachmentStore`.
- `fake_conta_matcher() -> ContaMatcher` (`whatsapp/application/conta_matcher.py:27`) — é o **fake**, não um adapter de produção.

**[fato]** Os **sete repos SQL** — `SqlBillRepo`, `SqlPaymentRepo`, `SqlAttachmentRepo`, `SqlPaymentProposalRepo`, `SqlWhatsappEventRepo`, `SqlHouseholdRepo`, `SqlUserRepo` — **não têm anotação tipada com seu Protocol em ponto nenhum**, nem em `src`, nem em `tests` (grep de `: BillRepo`/`Repo = Sql`/etc. em `tests` retorna vazio; nenhum `provide_*` os constrói). São instanciados cruamente nos testes (`SqlPaymentRepo(pg_engine)`, `tests/finance/adapters/test_payment_repo.py:31`) e nunca atribuídos a uma variável do tipo-port.

**[interpretação] Este é o ritual-sem-garantia central do padrão.** Como pyright só verifica aderência estrutural num ponto de atribuição/chamada com o tipo-port, e esse ponto **não existe** para os repos SQL, uma deriva de assinatura entre, digamos, `SqlPaymentRepo.edit_payment` e `PaymentRepo.edit_payment` **não seria pega pelo type-checker** — apenas, e só se, pelos testes de adapter (que checam comportamento, não conformidade de tipo). O mecanismo anunciado na docstring da `composition.py` é real para Clock/AttachmentStore e **ausente exatamente para a maioria dos adapters e para aqueles onde a deriva é mais provável** (7 tabelas, muitos métodos, mapeamento manual Row↔entidade). A garantia é aspiracional, não colhida.

**Força compensatória:** os adapters SQL têm testes de integração contra Postgres real (§14), que pegam deriva comportamental — inclusive escopo por Household e round-trip de mapeamento (`test_payment_repo.py:29-129`). A conformidade não está desprotegida, só não está protegida **pelo mecanismo que o código diz usar**.

**Recomendação de baixo custo (não prescrição):** um `provide_*_repo() -> XRepo` por adapter (ou um teste `_: XRepo = SqlXRepo(engine)`) restauraria a garantia estrutural que a doutrina promete — barato, e fecharia a lacuna antes de os endpoints existirem.

## 5. Fakes / dublês (onde vivem, forma, nomenclatura)

**[fato]** Os fakes vivem **ao lado do port, na camada `application`**, e são **reexportados na superfície pública** do contexto. Precedente declarado: "The handmade in-memory fake ships beside the Protocol (the `FixedClock` precedent) so every suite drives the same double" (`finance/application/payment_repo.py:3-5`; repetido em `attachment_store.py:3`, `payment_proposal_repo.py:5`).

**[fato]** A **nomenclatura é inconsistente entre contextos**:
- `finance` e `whatsapp`: prefixo `Fake*` — `FakePaymentRepo`, `FakeAttachmentStore`, `FakeNotifier`, `FakeDigestSendLog`, `FakePaymentProposalRepo`, `FakeWhatsappMessenger`, `FakeWhatsappEventRepo`, `FakeCalendar`.
- `identity`: prefixo `InMemory*` — `InMemoryUserRepo` (`identity/application/user_repo.py:83`), `InMemoryHouseholdRepo` (importado em `identity/application/__init__.py`).
- `shared`: `FixedClock` (`shared/application/clock.py:23`); `conta_matcher` usa a função `fake_conta_matcher` (minúscula).

**Força:** um único dublê por port, compartilhado por todas as suítes e **entre contextos** (o whatsapp dirige os fakes de `finance`: `respond_to_proposal.py:31-42` importa `FakeAttachmentStore` etc. via a application de finance). Os fakes espelham invariantes reais — `FakePaymentProposalRepo._cas_open` (`payment_proposal_repo.py:214`) reproduz o CAS `estado == 'proposta'` do SQL, e `create` reproduz o índice único parcial (`.../payment_proposal_repo.py:179-182`). Isso faz os **testes unitários exercitarem a semântica de corrida**, não uma aproximação boba.

**Fraqueza / anti-cerimônia:**
- **[fato]** Fakes de teste são **código de produção** — moram em `application` (que o Dockerfile empacota) e entram no `__all__` público. `FakePaymentRepo`, `FakeNotifier` etc. são importáveis pelo runtime. **[interpretação]** É o preço aceito do "precedente FixedClock"; o custo é que a fronteira contrato-vs-dublê some da superfície pública (§2) e o wheel carrega dublês.
- **[fato]** `Fake*` × `InMemory*` × `Fixed*` × `fake_*` — quatro convenções para a mesma coisa, divergindo por contexto. Nenhum ADR fixa o nome. **[interpretação]** Prática emergente sem convergência; o `identity` foi portado numa fatia diferente e cristalizou outro nome.

## 6. DI / composition root

**[fato]** DI é **composition root manual, sem container** (ratificado ADR-0014:21). A materialização é `provide_settings`/`provide_clock` (`composition.py:14,23`) mais fábricas locais nos adapters: `r2_attachment_store()` (`r2_attachment_store.py:190`), `system_clock()` (`system_clock.py:26`). A injeção nos use-cases é **por parâmetro** (o port é o primeiro argumento) ou por **deps-bundle** (`DigestDeps`, `ResponderDeps`). No edge, a única DI viva é a dependency do FastAPI para identidade (`CurrentIdentity = Annotated[Identity, Depends(current_identity)]`, `http/identity.py:80`).

**Força:** sem mágica de container, tudo rastreável; o use-case recebe exatamente o que usa; testes constroem o grafo à mão em uma linha.

**Fraqueza / anti-cerimônia:**
- **[fato]** `provide_clock()` (`composition.py:14`) e `system_clock()` (`system_clock.py:26`) são **duas fábricas que retornam `SystemClock()` tipado como `Clock`** — a do adapter nunca é usada pela composition root. Duplicata.
- **[interpretação]** "Composition root: `provide_*`, one per port" (`composition.py:1`) é uma **doutrina com dois membros** — declarada antes de ter sujeitos. Não há root que monte o grafo de um use-case real (repo + clock + store) porque nenhum use-case é servido. Quando os endpoints chegarem, essa root vai crescer muito de uma vez; hoje é andaime.

## 7. Forma do use-case — divergência ADR × prática

**[fato]** O ADR-0014 fixou a forma: "use-cases como `@dataclass(frozen=True, slots=True)` callable" (`docs/adr/0014-backend-python-fastapi.md:21`).

**[fato]** A prática é **outra**: use-cases são **funções `async def` livres**, com os ports como parâmetros — `create_bill(repo, household_id, raw)` (`finance/application/create_bill.py:22`), `record_payment(repo, clock, household_id, bill_id, raw)` (`.../record_payment.py:21`), `edit_bill(...)` (`.../edit_bill.py:22`), `link_google(...)`, `respond_to_proposal(deps, request)` (`whatsapp/application/respond_to_proposal.py:271`). Quando a aridade cresce, os ports vão para um **deps-bundle** `@dataclass` (`DigestDeps`, `ResponderDeps`) — mas o use-case **em si** nunca é um dataclass callable. Não achei um só use-case na forma ratificada.

**[interpretação]** A prática (função livre + deps-bundle quando aridade dói) é mais simples e provavelmente **melhor** que a forma ratificada, e é coerente com o ADR-0015 ("dataclasses stdlib + funções"; Percival & Gregory modelam serviço de domínio como função). Mas é **divergência não ratificada** de um ADR "Accepted": a letra do 0014 diz dataclass-callable, o código diz função. O ADR não foi emendado. Isso importa porque o `apps/api` é declaradamente o lab da skill `panlabs-python-standards` — o padrão que "viaja" precisa que doutrina e código concordem.

## 8. DTOs e validação por camada

**[fato]** Progressão de DTOs limpa e em camadas, toda `@dataclass(frozen=True)`:
`*Raw` (entrada de borda, possivelmente inválida — `BillRaw`, `PaymentRaw`, `bill.py:98`/`payment.py:47`) → `validate_*` → `Valid[*Data] | Invalid` (`finance/domain/validation.py:21-34`) → `*Data` (validado/normalizado) → `New*` (Data + ids de dono, `bill_repo.py:30`) → `*` (persistido, +identidade/estado).

**[fato]** A **validação vive no domínio**, retornando `Valid`/`Invalid` com `FieldError` que carrega **copy pt-BR** e o id de campo do formulário camelCase — `FieldError(field="nome", message="Dê um nome à Conta.")` e `field="intervalMonths"` (`finance/domain/validation.py:13`, `bill.py:160,179`). Erros de use-case embrulham essa lista: `InvalidBillError(res.errors)` (`create_bill.py:16`).

**[fato]** **Pydantic não aparece em `src`** (grep vazio). O ADR-0014 ratifica "pydantic só na borda", mas a borda que carregaria modelos pydantic não existe; a única validação de request é a nativa do FastAPI sobre um query param no teste sintético (`tests/http/test_problems.py:139`). Formas de fio usam `TypedDict` (`InteractiveButton`, `ProposalAction` em `payment_proposal.py:141,400`).

**Força:** "parse, don't validate" real — o domínio só vê `*Data` normalizado; o inválido morre no parse (ADR-0015). `Valid`/`Invalid` com discriminante `ok: Literal[True/False]` é um Result tipado idiomático.

**Fraqueza:**
- **[fato]** A copy de erro pt-BR mora no **domínio** (`bill.py`, `validation.py`), enquanto o ADR-0016 diz que a copy de produto é "montada na borda". **[interpretação]** Tensão real: a mensagem que o usuário lê nasce no core, não no edge — pragmático (uma fonte de verdade da regra), mas em atrito com a letra do 0016.
- **[fato]** Os ids de campo em `FieldError` misturam pt-BR (`nome`, `descricao`, `competencia`, `valor`) e camelCase (`intervalMonths`, `anchorMonth`, `dueRuleDay`, `paidBy`) — o contrato do formulário web vaza para dentro do domínio (`bill.py:179-221`, `payment.py:72-80`). **[interpretação]** Conhecimento de borda (nome de input) alojado no core.
- "Pydantic na borda" é ratificado mas **inteiramente inexercido** — não há como avaliar se o padrão se sustenta.

## 9. Topologia

**[fato]** Feature-first por contexto, cada um com `domain/`/`application/`/`adapters/` (ratificado ADR-0014:25). Fronteiras executáveis por **import-linter** com dois contratos (`pyproject.toml:97-117`): (1) camadas hexagonais `domain < application < (adapters)` por container, com os quatro contextos como containers; (2) `whatsapp` proibido de importar `finance.domain` (forçando o consumo via `finance.application`).

**[fato]** Dependência cross-context **`finance → identity`** é real e **não guardada**: `send_due_digest` importa `HouseholdRepo` de `identity.application` (`send_due_digest.py:40`), documentado como "accepted for now; no import-linter independence contract exists between contexts yet" (`.../send_due_digest.py:16-18`).

**Força:** o hexágono é executável, não decorativo — o domínio não pode importar framework nem adapter, e o CI reprova se importar (`lint-imports` no job `api`). O `whatsapp → finance.application` (não `.domain`) é a fronteira certa entre contextos, e é enforçada.

**Fraqueza:** **[fato]** não há contrato de independência entre contextos: `finance → identity` passa livre, e nada impede o inverso amanhã. **[interpretação]** A topologia de contextos é convenção documentada, não invariante executável (diferente das camadas, que são). Com quatro contextos e um acoplamento cross já presente, o risco de virar grafo emaranhado existe e hoje só o review o segura.

## 10. Kernel compartilhado e onde vive o schema do banco

**[fato]** O kernel `shared/domain` é mínimo e sem base classes: dinheiro como funções sobre `int` centavos (`money.py`), datas civis como `datetime.date` + parsers (`civil_date.py`), erros semânticos (`errors.py`), e o port `Clock` em `shared/application` (`clock.py`). Ratificado item a item pelo ADR-0015 (int centavos sem VO `Money`; `date` no lugar de `str` ISO; sem `Entity`/`ValueObject` genéricos).

**[fato]** O **schema do banco mora em `shared/adapters/db/metadata.py`** — as 7 tabelas como `MetaData` SQLAlchemy Core (`metadata.py:45-283`). Mas a docstring é explícita: **o DDL não é dele** — "The 13 raw SQL migrations under `apps/web/drizzle/` … remain the origin of this schema and its sole DDL owner" (`metadata.py:4-8`); o Alembic só **adota** via `baseline` no-op (`alembic/versions/baseline.py:16-21`).

**[fato]** As colunas são **pt-BR** (`nome`, `descricao`, `encerrada_em`, `primeira_competencia`, `estado`, `valor`, `data_pagamento`, `competencia`, `favorecido`, `remetente`, `aguardando_campo` — `metadata.py:52-283`), porque o schema é herdado do `apps/web`. Os adapters fazem a tradução no mapeamento Row↔entidade (`_row_to_bill`: `name=row.nome`, `amount_cents=row.valor`, `state=row.estado`, `bill_repo.py:198-213`).

**Força:** kernel enxuto e ensinável, exatamente como o ADR-0015 pede; a decisão `date`-nativo mata por construção a classe de bug "string de data torta circulando". O `metadata.py` como espelho-para-autogenerate (sem emitir `CREATE TABLE`) é a forma correta de coabitar com o dono do DDL (Drizzle) sem duas fontes de verdade.

**Fraqueza / seam permanente:** **[fato]** o schema pt-BR do `apps/web` é dono do DDL, o código do `apps/api` é inglês (ADR-0016) — **cada adapter é uma tradução de língua**, não só de forma. **[interpretação]** É seam documentado e aceito, mas perpétuo: enquanto o Drizzle for o dono do DDL, toda coluna nova nasce pt-BR e todo repo Python paga a tradução. O `metadata.py` também declara `whatsapp_events`/`whatsapp_proposals` "even though no `apps/api` context owns them yet" (`metadata.py:11-14`) só para o check de fidelidade não acusar falso-diff — cerimônia necessária, mas cerimônia.

## 11. Modelo de erro e tradução problem+json na borda

**[fato]** Taxonomia semântica em `shared/domain/errors.py`: raiz `DomainError` e quatro categorias — `NotFoundError`, `ConflictError`, `ValidationError`, `InvalidInputError` (`errors.py:17-34`), **sem número HTTP** ("categories by meaning, never by HTTP status", linha 1). Cada Área deriva erros nomeados: `BillNotFoundError(NotFoundError)`, `InvalidPaymentError(ValidationError)`, `LinkConflictError(ConflictError)`, `InvalidPhoneError(InvalidInputError)` — a taxonomia é **de fato usada** em todos os contextos (raises em `create_bill.py:30`, `edit_bill.py:34`, `link_google.py:55-62`, `link_phone.py:50-54`, etc.).

**[fato]** A tradução para HTTP nasce **só na borda**, em `http/problems.py`: tabela categoria→status (`problems.py:38-43`) e handler que **caminha o MRO** para achar a categoria de um erro derivado (`_domain_error_to_problem`, `problems.py:71-85`). Segue RFC 7807 (`application/problem+json`), com `detail` = mensagem semântica inglesa e payloads estruturados no membro de extensão `errors` (`problems.py:95-124`). `AuthenticationError` tem handler próprio → 401 com `WWW-Authenticate` (`problems.py:88-92,135`). Um `DomainError` sem categoria mapeada vira 500 com traceback logado e **sem vazar internals** (`problems.py:76-85`), comportamento coberto por teste (`test_problems.py:119-127`).

**Força:** este é o eixo **mais maduro e mais bem-testado** do backend. O edge de erro é robusto: MRO-walk para erros derivados, 599 fora da IANA com título de fallback, 204 sem corpo, detalhe estruturado preservado em `errors` (13 casos em `test_problems.py`). Núcleo ignora protocolo; borda é a única que sabe HTTP — exatamente o ADR-0003.

**Fraqueza:** **[fato]** dois "já existe" divergem de taxonomia: os conflitos de link derivam `ConflictError` → 409 (`user_repo.py:22,35`), mas o dedup de Proposta usa **`DuplicateProposalError(Exception)` cru** (`whatsapp/application/payment_proposal_repo.py:32`), fora da árvore `DomainError`. Se chegasse ao edge sem tratamento, cairia no 500 genérico, não num 409. **[interpretação]** É defensável (é sinal de controle de fluxo, capturado no fluxo do webhook, não um erro HTTP), mas é inconsistência da taxonomia — "duplicidade" é justamente o que `ConflictError` existe para nomear (`errors.py:25`). Idem `AuthenticationError(Exception)` (`http/identity.py:23`), fora de `DomainError` mas com handler próprio — aqui justificado (é preocupação de edge, não de domínio).

## 12. Configuração / env

**[fato]** `Settings` é um `@dataclass(frozen=True, slots=True)` resolvido uma vez no boot, **fail-closed**: recusa subir sem `LUC_INTERNAL_JWT_SECRET` (`settings.py:12-32`). É injetado em `app.state.settings` (`main.py:23`).

**[fato]** A configuração é **descentralizada**: `os.environ` é lido em só dois lugares de `src` — `settings.py:29` (o JWT) e `r2_attachment_store.py:88,211` (as cinco `R2_*`). O adapter R2 lê o próprio env direto via `_read_env` (`r2_attachment_store.py:86-91,204-214`), **contornando `Settings`**. `DATABASE_URL` não é lido em nenhum caminho de runtime de `src` — só em `alembic/env.py:25` e no suporte de teste (`tests/support/postgres.py:27`).

**[fato]** `.env.example` documenta **apenas** `LUC_INTERNAL_JWT_SECRET` (`apps/api/.env.example:7`). As `R2_*` e `DATABASE_URL` aparecem só no CI (`pr-checks.yml`).

**Força:** fail-closed no segredo de auth é a postura certa (não aceita chamada não-autenticada por falta de config). `Settings.from_env` centralizado e imutável.

**Fraqueza:** **[fato]** há **duas disciplinas de config concorrentes** — `Settings` central (só JWT) e o adapter R2 se auto-resolvendo do env. **[interpretação]** Inconsistente; a razão provável é que o R2 store não é wired por composition root (§0/§6), então resolve o próprio env como paliativo. `.env.example` incompleto relativo ao que os adapters exigem — um dev que ligue o R2 store localmente descobre as vars faltantes só no `RuntimeError`. Sintoma do mesmo desligamento núcleo-borda.

## 13. Async

**[fato]** Async-first uniforme (ratificado ADR-0014:20): ports `async def`, use-cases `async def`, fakes `async`, `asyncio_mode = "auto"` no pytest (`pyproject.toml:90`). Engine async psycopg3 (`engine.py:27`). O boto3 (sem cliente async) roda cada chamada de rede em `to_thread` (`r2_attachment_store.py:143,162,174,179`), e o `command.upgrade` síncrono do Alembic vai para `asyncio.to_thread` sob advisory lock (`migrate.py:55`).

**Força:** consistência total; o único bloco de I/O bloqueante (boto3, Alembic) é isolado em thread — decisão correta e documentada. `ruff` liga o set `ASYNC` (`pyproject.toml:57`), então blocking-in-async é gateado.

**Fraqueza (menor):** **[fato]** `R2AttachmentStore.upload_url`/`read_url` são `async def` sem `await` — presign é computação local (`r2_attachment_store.py:133-139,151-157`), async só para satisfazer o Protocol async. **[interpretação]** Custo nulo e correto (o port é async por uniformidade), mas é superfície async onde o trabalho é síncrono — uniformidade acima de precisão, aceitável.

## 14. Transações e atomicidade (CAS, claim/release, compensação)

**[fato]** Persistência é SQLAlchemy Core, e **cada método de repo é sua própria transação** (`engine.begin()` por método; docstring "every method is its own transaction" em `payment_repo.py:19`, `bill_repo.py:35`, `payment_proposal_repo.py:42`).

**[fato]** CAS cirúrgico como padrão de transição de estado: `update().where(estado == de).returning()`, RETURNING vazio = corrida perdida, nunca exceção — `SqlBillRepo.close_bill`/`reactivate_bill` guardam `estado == 'ativa'`/`'encerrada'` (`bill_repo.py:75-105`); `SqlPaymentProposalRepo._cas_open` guarda `estado == 'proposta'` para as sete transições (`payment_proposal_repo.py:194-210`).

**[fato]** **Claim/release** com índice único: `SqlWhatsappEventRepo.claim` insere-primeiro e traduz violação de unique em `False` (`whatsapp_event_repo.py:25-35`); o digest **reclama antes de enviar e libera na recusa** (`send_due_digest.py:154-169`), com o `Notifier.send_template` devolvendo `bool` para manter a falha visível (`notifier.py:27-34`).

**[fato]** **Compensação** onde não cabe transação: o Confirm cria Payment + Attachment + copia bytes R2 **antes** do CAS `proposta→confirmada` (o CAS é o commit final), e desfaz o parcial em falha ou corrida perdida (`respond_to_proposal.py:424-476`, `_compensate_partial:490-515`, best-effort, nunca re-levanta). `create` de Proposta confia no índice único parcial `whatsapp_proposals_hash_ativo_uidx` (`payment_proposal_repo.py:45-63`).

**Força:** este é o eixo **mais sofisticado e melhor-raciocinado** do backend, e o design está documentado no ponto do código. `set_awaiting` é o único a agrupar dois writes numa transação, e explica por quê (o CAS no alvo primeiro, depois libera outras pendências da Pessoa — os dois "ou ambos ou nenhum", `payment_proposal_repo.py:128-160`). Os fakes reproduzem a semântica de corrida (§5), então os testes unitários a exercitam.

**Fraqueza / limite honesto:**
- **[fato]** Não há transação cross-repo. O Confirm toca três stores (payments, attachments, R2, whatsapp_proposals) em **transações separadas**; a atomicidade é por **CAS-como-commit + compensação**, não por ACID abrangente.
- **[interpretação]** É o desenho correto (R2 não entra numa transação Postgres), mas tem cauda: a compensação é best-effort e **pode falhar** — o próprio código admite "becomes garbage to collect on failure" (`respond_to_proposal.py:262`). Uma falha de compensação deixa órfão (Attachment/objeto R2) sem varredura automática que o recolha. Aceitável no volume de 2 usuários, mas é dívida de consistência real, não coberta por reconciliação.
- **[fato]** A tradução de violação de unique é por **string-match no nome do constraint** (`if "whatsapp_proposals_hash_ativo_uidx" in str(exc.orig)`, `payment_proposal_repo.py:60`; idem `whatsapp_event_repo.py:32`). **[interpretação]** Frágil a rename de constraint (que mora no schema do `apps/web`, fora deste repo) — quebraria silenciosamente virando 500 em vez de `DuplicateProposalError`.

## 15. Doutrina de testes

**[fato]** Testes de use-case/domínio: nome `test_<scenario>_<expected>` (ADR-0016), AAA separado por linha em branco, comentários `# given`/`# when`/`# then` só no primeiro caso com montagem real (`test_record_payment.py:34-46`), fakes dos ports, `FixedClock` no lugar do relógio (`test_record_payment.py:28`). Porte 1:1 do oráculo TS declarado no docstring do módulo, com o caminho do oráculo citado (`test_record_payment.py:1-4`).

**[fato]** Testes de adapter (Seam-2): `pytestmark = requires_postgres` (`test_payment_repo.py:16`), rodam contra **Postgres real** só no CI (skip local sem `DATABASE_URL`, `tests/support/postgres.py:29-31`), com o schema legado das 13 migrações SQL do `apps/web` replicado idempotentemente por sessão (`postgres.py:47-64`). O `R2AttachmentStore` roda contra **MinIO real** no CI (`pr-checks.yml`, serviço MinIO + `R2_ENDPOINT`). Scaffolding centralizado em `tests/support/finance.py` (`scaffold_bill`/`new_bill`).

**Força:** doutrina forte e coerente com o ADR-0014 (dois gates: suíte 1:1 + adapters contra Postgres real). Fakes que espelham invariantes fazem o teste unitário valer; o teste de adapter cobre escopo-por-Household e round-trip de mapeamento contra o banco de verdade. 597 casos.

**Fraqueza:**
- **[fato]** `# type: ignore[arg-type]` recorrente nos builders de teste (spread de `**over`/`**values` em dataclass frozen — `test_payment_repo.py:26`, `support/finance.py:35`, `test_record_payment.py:25`). **[interpretação]** Cerimônia repetida que fura o pyright strict localmente; sintoma do custo de kwargs-spread em dataclasses tipadas.
- **[fato]** A conferência de paridade com o oráculo TS é **posicional**, não nome-a-nome (ADR-0016:40 aceita isso: sem `parametrize` no porte, ordem preservada). **[interpretação]** Verificável por review, não por ferramenta — o gate de paridade é semântico e humano, não automatizado.
- **[interpretação]** Não há teste ponta-a-ponta de HTTP sobre um use-case real (só o `/boom/*` sintético de `test_problems.py` e o echo `/me`), coerente com §0.

## 16. Régua (ruff, pyright strict, import-linter, CI)

**[fato]** Régua forte e ratificada (ADR-0014:25): ruff com set curado (`E,W,F,I,B,C4,UP,SIM,N,D,PTH,ASYNC,PL,TID,RUF`, docstrings Google, `ban-relative-imports=all`, `pyproject.toml:41-74`), pyright `strict` sobre `src`+`tests` (`pyproject.toml:81-84`), import-linter (§9), gitleaks no repo inteiro. O job `api` do CI roda os cinco — `ruff format --check`, `ruff check`, `pyright`, `lint-imports`, `pytest` contra Postgres+MinIO reais (`pr-checks.yml`, job `api`).

**Força:** cobertura de régua acima do usual — strict + fronteiras executáveis + segredos + integração real no mesmo gate. `main` protegida, PR aberto no verde, merge autônomo (ADR-0007).

**Fraqueza / anti-cerimônia:**
- **[fato]** Supressões `# noqa` recorrentes justificadas por **paridade com o oráculo**: `PLR0912` (`bill.py:150`), `PLR0911` (`payment_proposal.py:412`), `PLR0913` (`respond_to_proposal.py:325,490`). **[interpretação]** A régua é localmente sobreposta para preservar o 1:1 TS — defensável durante o porte, mas são pontos onde a métrica de complexidade foi desligada em vez de atendida; quando o oráculo morrer no cutover, essas supressões viram dívida sem álibi.
- **[fato]** import-linter tem só dois contratos e **nenhum** de independência entre contextos (§9) nem de minimalidade do kernel. **[interpretação]** A régua de fronteira é forte nas camadas, fraca nos contextos.
- **[fato]** Não há gate de cobertura, nem o gate de drift OpenAPI→TS que o ADR-0014:24 previu (não existe OpenAPI real ainda — §0).

## 17. Estilo (docstrings, façades, `__all__`)

**[fato]** Docstrings Google em inglês em todo artefato (ADR-0016), com docstring-mapa nos `__init__.py` e citação pt-BR do termo de domínio uma vez ("Payment (Lançamento): …", `payment.py:1`) — a regra-ponte do glossário está sendo seguida. Façade + `__all__` universais.

**[fato]** **Valores de fio pt-BR** em `Literal`/constantes, justificados como contrato persistido/edge herdado do oráculo: `BillState = Literal["ativa","encerrada"]` (`bill.py:31`, justificado na linha 4), estados de Proposta (`payment_proposal.py:73`), ids de botão/ação (`confirmar`/`alterar`/`escolher-conta`), beacons (`vermelho`/`amarelo`/`cinza`/`verde`, `occurrence_state.py:26`).

**Fraqueza / inconsistência ADR-0016:**
- **[fato]** `remetente` (pt-BR) é **nome de parâmetro** no port, no adapter e no fake do `WhatsappEventRepo` — `async def claim(self, wa_message_id: str, remetente: str)` (`whatsapp/application/whatsapp_event_repo.py:17,43`; `adapters/whatsapp_event_repo.py:25,27`). O resto do whatsapp usa `sender` em inglês (`respond_to_proposal.py:204`). **[interpretação]** Um identificador pt-BR vazou da coluna (`metadata.py:206`) para a **assinatura de método** — poderia ser `sender`; é o desvio mais nítido do ADR-0016 (que manda **todo** identificador em inglês, distinto do valor-de-fio, que é contrato).
- **[fato]** `DigestSendResult.status = Literal["sem-lar","nada-a-enviar","enviado"]` (`send_due_digest.py:76`) é pt-BR, mas **não é** valor persistido nem de fio — é retorno interno de um use-case escrito fresco (#189), não herdado do oráculo. **[interpretação]** Aqui o álibi "contrato herdado" não se aplica; é pt-BR onde o 0016 pediria inglês.

## 18. Observabilidade

**[fato]** Observabilidade é **fina e inconsistente**:
- `logging.getLogger(__name__)` em dois lugares: `http/problems.py:32` (loga erro não-mapeado com traceback) e `send_due_digest.py:51`.
- Mas `respond_to_proposal` **injeta um `log: Callable` que cai em `print`** por padrão (`respond_to_proposal.py:196,216`: `(log or print)(message)`), usado em todo o fluxo de Confirm/compensação/matcher (`.../respond_to_proposal.py:268,462,546`).
- **Não há configuração de logging** em `src` nem em `conftest` (grep de `dictConfig`/`basicConfig`/`Formatter` vazio) — só o default do uvicorn.
- Nenhuma métrica, tracing, request-id ou correlação.
- `/health` é estático `{"status":"ok"}` (`health.py:10-17`) — liveness, **não** readiness (não checa Postgres/R2).
- PII: o digest **mascara telefone** no log (`_mask_phone`, `send_due_digest.py:96-108`) — higiene boa.

**Contradição documentada (o achado mais afiado deste eixo):** **[fato]** o `send_due_digest` argumenta **explicitamente contra** injetar log e a favor do stdlib: "The TS oracle injects a `log` callback … Python already has that decoupling via the stdlib `logging` module, so this port calls `logging.getLogger(__name__)` directly instead of threading a log dependency through `DigestDeps`" (`send_due_digest.py:20-22`). E o `respond_to_proposal`, no mesmo contexto whatsapp, **faz exatamente o que aquele texto rejeita** — injeta `log` com default `print` (`respond_to_proposal.py:196`). **[interpretação]** Dois use-cases irmãos, duas doutrinas de log opostas, uma criticando a outra por escrito. A causa provável: `respond_to_proposal` é porte 1:1 do oráculo TS (preservou o `log` injetado), `send_due_digest` foi escrito fresco (idiomático). O resultado é `print` em código de servidor de produção, sem nível, sem formato, sem config.

## 19. Divergências ADR × prática (síntese)

| # | ADR ratifica | Código faz | Citação | Leitura |
|---|---|---|---|---|
| 1 | Use-case = `@dataclass(frozen=True, slots=True)` callable (0014:21) | Função `async def` livre + deps-bundle | `create_bill.py:22`, `respond_to_proposal.py:271` | Prática provavelmente melhor, mas ADR não emendado |
| 2 | Conformidade validada no retorno tipado da composition root (`composition.py:2`) | Só 3 pins (Clock, AttachmentStore, fake matcher); 7 repos SQL sem pino | §4 | Ritual anunciado, garantia não colhida |
| 3 | Todo identificador em inglês (0016) | `remetente` como parâmetro; `DigestSendResult.status` pt-BR | `whatsapp_event_repo.py:17`, `send_due_digest.py:76` | Desvio localizado do 0016 |
| 4 | Copy de produto montada na borda (0016) | Copy pt-BR de validação nasce no domínio | `validation.py`, `bill.py:160` | Atrito com a letra; pragmático |
| 5 | pydantic na borda (0014:24) | Nenhum pydantic; borda inexistente | §8/§0 | Ratificado e inexercido |
| 6 | Migração no boot do container (0014:22) | `migrate_on_boot` implementado, não wired | §0 | Implementado, desconectado |

## 20. Pontos de adjudicação (para a decisão, não prescrição)

1. **A doutrina de conformidade precisa de pino ou de reescrita.** Ou se adiciona `provide_*_repo() -> XRepo` / assert de tipo por adapter (barato, restaura a garantia que a `composition.py` promete), ou se reconhece que a conformidade é responsabilidade dos testes de adapter e se corrige a docstring que hoje afirma o contrário (§4).
2. **Emendar o ADR-0014 à forma real do use-case** (função livre + deps-bundle) — ou justificar por que a letra "dataclass callable" fica. Importa para a skill `panlabs-python-standards` (§7).
3. **Convergir a nomenclatura de fakes** (`Fake*` × `InMemory*` × `Fixed*`) e decidir se dublê de teste deve morar em `application` público ou num pacote de suporte (§5).
4. **Doutrina única de observabilidade** antes dos endpoints: escolher stdlib `logging` (como o `send_due_digest` argumenta) e matar o `print` injetado; adicionar config de log, readiness no `/health`, e decidir sobre request-id/tracing (§18).
5. **Independência entre contextos**: promover a um contrato import-linter, ou aceitar formalmente `finance → identity` como acoplamento permanente (§9).
6. **Consistência transacional**: definir se órfãos de compensação falha (§14) precisam de varredura de reconciliação, ou se o volume de 2 usuários dispensa — decisão explícita, não silêncio.
7. **Fechar a régua pós-porte**: as supressões `# noqa "mirrors the oracle"` (§16) devem ser reavaliadas quando o oráculo TS morrer no cutover.

## Apêndice — o que é genuinamente forte (para não ler como só-crítica)

- O edge de erro problem+json é maduro, RFC-correto e o mais testado do repo (§11).
- CAS-como-commit + claim/release + compensação é rigoroso e bem-raciocinado, com fakes que exercitam a corrida (§14).
- Domínio puro sem framework, com o hexágono **executável** por import-linter e a suíte rodando sem banco — o gate de paridade do porte (§9/§15).
- `datetime.date` "parse-don't-validate" (ADR-0015) mata por tipo uma classe inteira de bug (§10).
- Mapeamento Row↔entidade explícito atravessa o seam pt-BR↔inglês com anti-corruption limpa (§10).
- Testes contra Postgres e MinIO **reais** no CI, não mocks (§15/§16).
