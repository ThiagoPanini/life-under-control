# Doutrina de testes e contract tests — o que os artigos originais realmente dizem

> Research do ticket [#228](https://github.com/ThiagoPanini/life-under-control/issues/228) (mapa wayfinder #219). Fechado em 17/07/2026.
> Método: cada afirmação tem uma **fonte-dona** — o artigo/livro original do conceito ou a doc oficial da ferramenta, com link. Onde a fonte é opinião de terceiro, vem rotulada **[opinião]**. Onde a afirmação é sobre comportamento de ferramenta, foi **verificada por experimento** neste repo (marcada ✔ verificado) ou remete à doc exata. Ao citar Meszaros e Fowler, fui ao texto original (xunitpatterns.com, martinfowler.com), não a resumos.

## TL;DR

1. **Dublê de teste** é o termo-guarda-chuva de Gerard Meszaros (analogia com o "stunt double" do cinema); os cinco tipos — Dummy, Stub, Spy, Mock, Fake — **não** são sinônimos intercambiáveis, e o folclore os achata. A distinção original de Meszaros é sobre **papel no teste**, não sobre biblioteca: Stub é *control point* para as **entradas indiretas** do SUT; Spy e Mock são *observation points* para as **saídas indiretas**; Fake tem implementação real e não é nem um nem outro. Confundir "mock" com "qualquer dublê" apaga justamente a informação que importa: **quanto o teste acopla ao contrato de interação** do código.
2. **Mock acopla o teste à implementação**; Stub/Fake acoplam ao estado. Fowler ("Mocks Aren't Stubs") é explícito e classicista: mock verifica *comportamento* (quais chamadas foram feitas), e "mudar a natureza das chamadas a colaboradores costuma quebrar um teste mockist". O LUC é **classicista por convenção** — ver §2.
3. **Contract test** (Fowler) resolve o problema que *nenhum type system pega*: se o seu dublê ainda representa fielmente o serviço real. Tipo garante forma (assinatura, nulabilidade); **não** garante que a coluna se chama mesmo `household_id` no Postgres, que o `close_bill` real é CAS, ou que o presign não injeta um header de checksum. Isso só um teste contra o real verifica. O LUC tem **um** contract test genuíno (`test_metadata_fidelity.py`) e **não tem** a suíte-única-contra-fake-e-real que Fowler descreve — ver §3.
4. **pytest**: fixtures são injeção de dependência por nome-de-argumento; `parametrize` roda a mesma função com vários conjuntos e **reporta cada um como um caso**; markers anotam/selecionam. `pytest-asyncio` em `asyncio_mode = "auto"` roda `async def test_...` **sem** decorator — ✔ verificado (535 testes assíncronos sem marker). Ver §4.
5. **Infra real**: testcontainers (serviço real e descartável em Docker) é o padrão de indústria; o LUC escolheu a alternativa "docker-compose + gate por env que skipa sem infra" (Seam-2). Funciona, mas o gate está **inconsistente**: Postgres skipa limpo sem infra, R2/MinIO **erra** — ✔ verificado. Ver §5.
6. **Cobertura** mede *linhas/ramos executados*, nada mais. Fowler: "números altos de cobertura são fáceis demais de atingir com testes de baixa qualidade". **Mutation testing** (DeMillo/Lipton/Sayward, 1978) é o contraponto: mede se os testes *detectam defeitos*, não se *tocam* o código. O LUC não usa nem um nem outro. Ver §6.

---

## 1. Taxonomia de dublês — o texto original, não o folclore

### 1.1 O guarda-chuva: "Test Double"

O termo é de Gerard Meszaros, em *xUnit Test Patterns* (2007). Na página canônica, ele o define e dá a origem da analogia (citação literal de [xunitpatterns.com/Test Double.html](http://xunitpatterns.com/Test%20Double.html), verificada por fetch direto do HTML):

> "How can we verify logic independently when code it depends on is unusable? […] We replace a component on which the SUT depends with a 'test-specific equivalent.'"

E a origem do nome (mesma página):

> "[…] when it is dangerous for the leading actor to carry out [a scene], they hire a 'stunt double' […] our equivalent of the 'stunt double': the Test Double."

Dois termos de Meszaros aparecem o tempo todo e são o que o folclore perde: **SUT** (*system under test*, o código exercitado) e **DOC** (*depended-on component*, o colaborador que o dublê substitui). E, sobretudo, a distinção entre **entradas indiretas** (o que o DOC *fornece* ao SUT) e **saídas indiretas** (o que o SUT *faz* contra o DOC). É nesse eixo que os cinco tipos se separam — não por qual biblioteca você usa.

### 1.2 Os cinco tipos, nas palavras originais

Fowler segue o vocabulário de Meszaros e o cita em ["Mocks Aren't Stubs"](https://martinfowler.com/articles/mocksArentStubs.html) e em [bliki: Test Double](https://martinfowler.com/bliki/TestDouble.html). Definições literais de Fowler (bliki, verbatim):

- **Dummy** — "Dummy objects are passed around but never actually used. Usually they are just used to fill parameter lists." (Meszaros nota que um Dummy "isn't really a Test Double per se" — é mais um valor de preenchimento.)
- **Fake** — "Fake objects actually have working implementations, but usually take some shortcut which makes them not suitable for production."
- **Stub** — "Stubs provide canned answers to calls made during the test, usually not responding at all to anything outside what's programmed in for the test."
- **Spy** — "Spies are stubs that also record some information based on how they were called. One form of this might be an email service that records how many messages it was sent."
- **Mock** — "Mocks are pre-programmed with expectations which form a specification of the calls they are expected to receive. They can throw an exception if they receive a call they don't expect and are checked during verification to ensure they got all the calls they were expecting."

O que o resumo popular apaga é a **razão de existir** de cada um, que só o texto de Meszaros dá (citações literais de [xunitpatterns.com/Test Double.html](http://xunitpatterns.com/Test%20Double.html)):

- **Test Stub** — "We use a Test Stub to replace a real component on which the SUT depends so that the test has a **control point for the indirect inputs** of the SUT. This allows the test to force the SUT down paths it might not otherwise execute." (Stub = você *empurra* dado pra dentro do SUT.)
- **Test Spy** — "an **observation point for the indirect outputs** of the SUT. […] the Test Spy is 'just a' Test Stub with some recording capability." (Spy = Stub que também *grava* o que o SUT fez.)
- **Mock Object** — "We can use a Mock Object as an **observation point that is used to verify the indirect outputs** of the SUT […] a Mock Object is lot more than just a Test Stub plus assertions; it is used a fundamentally different way." (A verificação é *parte do dublê*, embutida como expectativa, e falha o teste de dentro.)
- **Fake Object** — "We use a Fake Object to replace the functionality of a real DOC in a test **for reasons other than verification of indirect inputs and outputs** of the SUT. Typically, it implements the same functionality as the real DOC but in a much simpler way. […] it is **not used as either a control point or a observation point** by the test. The most common reason for using a Fake Object is that the real depended-on component is not available yet, is too slow or cannot be used in the test environment because of deleterious side effects." Variações que Meszaros nomeia: **Fake Database** ("a set of in-memory HashTables") e **In-Memory Database**.

### 1.3 O custo de cada um: acoplamento ao contrato

O eixo que decide o custo é **verificação de estado × verificação de comportamento** (Fowler, "Mocks Aren't Stubs", verbatim):

> "With state verification we do this by asserts against the warehouse's state. Mocks use behavior verification, where we instead check to see if the order made the correct calls."

E a consequência, que é o núcleo da decisão de engenharia (Fowler, verbatim):

> "Mockist tests are thus more coupled to the implementation of a method. Changing the nature of calls to collaborators usually cause a mockist test to break."

Traduzindo para o custo prático:

| Dublê | Verifica | Acopla o teste a… | Quebra quando muda… | Custo típico |
|---|---|---|---|---|
| **Dummy** | nada | nada | — | ~zero; é só preenchimento |
| **Stub** | estado (via entradas que injeta) | o **contrato de dados** do port (formato de retorno) | a forma do que o colaborador devolve | baixo |
| **Fake** | estado (comportamento real simplificado) | o **contrato semântico** do port (o que ele *faz*) | a semântica do port | baixo-a-médio; risco = o fake *divergir* do real (→ §3) |
| **Spy** | saídas indiretas (pós-fato, por asserção sua) | o **contrato de interação** (que chamada aconteceu) | quais chamadas o SUT faz | médio |
| **Mock** | saídas indiretas (expectativa embutida, pré-fato) | o **contrato de interação, rígido** | *qualquer* mudança na sequência/forma das chamadas | alto; testa implementação, não resultado |

Regra de bolso destilada do texto: **Stub/Fake acoplam ao *quê* (estado/resultado); Spy/Mock acoplam ao *como* (interação).** Quanto mais o teste fala de "como", mais ele quebra em refactors que preservam o comportamento — que é exatamente o tipo de mudança que você *quer* que o teste deixe passar.

### 1.4 Classicista × mockista (e onde o Fowler fica)

Fowler nomeia as duas escolas (verbatim): o **classicista** (Detroit) "usa objetos reais quando possível e um dublê quando é incômodo usar a coisa real"; o **mockista** (London) "sempre usa um mock para qualquer objeto com comportamento interessante". A posição dele, no fim do artigo (verbatim):

> "Personally I've always been a old fashioned classic TDDer and thus far I don't see any reason to change."

**[opinião, mas de peso]** A crítica prática ao estilo mockista — testes que reespelham a implementação e precisam ser reescritos junto com ela — é o que empurra a maior parte da doutrina moderna de arquitetura hexagonal (ports & adapters) para **fakes sobre os ports**, não mocks dos colaboradores. É a mesma linha que o LUC segue (ADR-0003).

---

## 2. O que o LUC faz hoje com dublês (evidência)

O repo é **classicista por convenção** e a convenção está no CLAUDE.md ("use-case com fakes dos ports (sem DB); `Clock`/`FixedClock` no lugar do relógio real (nunca freezegun)"). A evidência bate:

- **Fake de port, de manual, in-memory** — `FakeBillRepo` em [`apps/api/tests/finance/application/test_create_bill.py:17`](../../apps/api/tests/finance/application/test_create_bill.py). É um **Fake** de Meszaros no sentido estrito (implementação real simplificada, guarda os "persistidos" numa lista) *e* carrega uma capacidade de **Spy**: o inspetor `self.recorded` (`test_create_bill.py:21`) grava o que foi persistido, e os testes fazem `assert len(repo.recorded) == 1` (linha 101) — observação de saída indireta *por asserção do teste*, no estilo Spy, nunca como expectativa embutida no estilo Mock. Detalhe honesto de fidelidade: os métodos do port não exercitados levantam `NotImplementedError("not used")` (linhas 46-65) — o fake é **parcial** de propósito, o que é um pequeno risco de divergência (§3).
- **Stub do relógio, shipado em produção** — `FixedClock` vive no **código de produção**, não no test-support: [`apps/api/src/luc_api/shared/application/clock.py:27`](../../apps/api/src/luc_api/shared/application/clock.py), um `@dataclass(frozen=True)` que implementa o `Protocol` `Clock` e devolve sempre a data injetada. É o **Test Stub** canônico de Meszaros — *control point* para a entrada indireta "hoje". A escolha explícita de um Stub próprio **em vez de `freezegun`** é doutrinária (CLAUDE.md; e não há nenhuma ocorrência de `freezegun`/`freeze_time` no repo — ✔ verificado por grep).
- **Ausência deliberada de mocks** — não há **nenhum** `unittest.mock`, `MagicMock`, `create_autospec` ou `mocker`/`pytest-mock` na suíte (✔ verificado por grep em `apps/api/tests`). O único uso de `monkeypatch` está em `tests/test_settings.py` e `tests/test_composition.py`, e **só para variáveis de ambiente** — não para dublar colaboradores. Ou seja: o LUC evita justamente o acoplamento a interação da §1.3.

Leitura: o LUC pousou no canto barato da tabela — Stub/Fake, verificação de estado. O preço que ele paga por isso é o da §3: o fake pode divergir do adapter real, e nada além de duas suítes escritas à mão garante que não divergiu.

---

## 3. Contract tests — o que tipo nenhum pega

### 3.1 O problema, na fonte

O dublê da §2 levanta a pergunta que Fowler formula em [bliki: IntegrationContractTest](https://martinfowler.com/bliki/IntegrationContractTest.html) (verbatim):

> "testing against a double always raises the question of whether the double is indeed an accurate representation of the external service, and what happens if the external service changes its contract?"

A receita dele (verbatim):

> "continue to run your own tests against the double, but in addition […] periodically run a separate set of contract tests. These check that all the calls against your test doubles return the same results as a call to the external service would."

Pontos operacionais do artigo:

- **Cadência pelo serviço, não pelo código** — rodar os contract tests "based on the rhythm of changes to the external service", às vezes só diário; não a cada commit.
- **Falha = comunicação, não só build vermelho** — quando um contract test quebra, o sinal é "o serviço mudou o contrato", e a ação é falar com quem provê o serviço.
- **Consumer-Driven Contracts** ([bliki: ContractTest](https://martinfowler.com/bliki/ContractTest.html)) — o passo além: o time provedor tem cópias dos *seus* contract tests e os roda no pipeline dele, então descobre que quebrou você *antes* de publicar.

### 3.2 O que isso cobre que nenhum type system cobre

Esta é a parte que o ticket pede em negrito, e vale ser preciso. Um type checker (pyright strict, no caso) prova propriedades **sintáticas e locais**: que `create_bill` recebe `NewBill` e devolve `Bill`, que `logo_key` é `str | None`, que você não passou um `int` onde ia `date`. Ele **não** tem como saber, e portanto nunca pega:

- que a coluna no Postgres se chama mesmo `household_id` e é `uuid` — o tipo Python `str` do id não sabe da coluna real;
- que `close_bill` real é **compare-and-swap** (o segundo close perde a corrida e devolve `None`) — isso é comportamento do SQL `UPDATE … WHERE state = …`, invisível ao tipo;
- que o `list_bills` real **escopa por Household** e não vaza linha de outro Lar — invariante de negócio, não de tipo;
- que o presign de upload **não** assina um header de checksum que faria o `fetch` PUT do browser falhar — detalhe de wire protocol da AWS;
- que a sua modelagem SQLAlchemy do schema **corresponde** ao schema que as migrations realmente produziram.

Tudo isso é *comportamento do outro lado da fronteira*. É exatamente o que o fake pode acertar por acaso e o adapter real pode errar (ou vice-versa) sem que compilador ou type checker piem. O contract test é o **único** artefato que fecha esse buraco.

### 3.3 O LUC: um contract test genuíno, e o gap do resto

O que o LUC **tem** e é, na definição de Fowler, um contract test de verdade:

- [`apps/api/tests/shared/adapters/db/test_metadata_fidelity.py:1`](../../apps/api/tests/shared/adapters/db/test_metadata_fidelity.py). Usa `alembic.autogenerate.compare_metadata` para afirmar que a `MetaData` SQLAlchemy (o *modelo* Python do schema, do qual todos os adapters derivam suas queries) **bate** com o schema real que as 13 migrations SQL produziram no Postgres. O docstring diz o teste na íntegra: "An `alembic revision --autogenerate` right after adopting a legacy-migrated database must draft an EMPTY migration — any operation it proposes means the `MetaData` was mirrored wrong." Isto é um contract test model-vs-realidade no sentido estrito: pega drift que type nenhum pega.

O que o LUC **não tem**, e é o cerne do padrão IntegrationContractTest:

- **A suíte única rodada contra o fake E contra o adapter real.** Hoje o `FakeBillRepo` (`test_create_bill.py`) e o `SqlBillRepo` real ([`apps/api/tests/finance/adapters/test_bill_repo.py:24`](../../apps/api/tests/finance/adapters/test_bill_repo.py)) são testados por **suítes separadas, escritas à mão**. Ambas afirmam, cada uma do seu lado, que uma Conta nasce `state == "ativa"` (fake: `test_create_bill.py:99`; real: `test_bill_repo.py:31`) e que a listagem escopa por Household (fake: linha 143; real: linha 59). O "contrato" existe — mas é mantido por **duplicação e disciplina**, não por um oráculo compartilhado. Se alguém mudar o fake e esquecer o real (ou o real derivar do fake), **nada cruza os dois automaticamente**. É precisamente o risco que a §3.1 nomeia.

**[opinião]** O caminho fowleriano aqui seria extrair as asserções comportamentais do port `BillRepo` numa suíte parametrizada por *implementação* (`params=[FakeBillRepo, lambda: SqlBillRepo(pg_engine)]`) e rodá-la contra as duas — o fake sempre, o real sob o gate Seam-2. Custa uma refatoração dos testes; paga com a garantia de que o fake nunca mente sobre o real. Não é urgente (o `test_metadata_fidelity` já cobre o drift de *schema*, que é o mais perigoso), mas é a evolução natural quando um terceiro adapter do mesmo port aparecer.

---

## 4. pytest — doutrina primária

Fontes: docs oficiais em [docs.pytest.org](https://docs.pytest.org/en/stable/) e [pytest-asyncio.readthedocs.io](https://pytest-asyncio.readthedocs.io/en/stable/). Onde há afirmação de comportamento, verifiquei rodando a suíte do repo.

### 4.1 Fixtures = injeção de dependência por nome

O modelo do pytest ([How to use fixtures](https://docs.pytest.org/en/stable/how-to/fixtures.html)): uma fixture é uma função decorada com `@pytest.fixture`; um teste (ou outra fixture) a **requisita nomeando-a como argumento**, e o pytest a resolve e injeta. Isso é DI de manual sem container. Pontos da doc que importam ao LUC:

- **Escopo** — `function` (padrão), `class`, `module`, `package`, `session`. O `pg_engine` do LUC é `scope="session"` ([`apps/api/tests/support/postgres.py:57`](../../apps/api/tests/support/postgres.py)) — um único engine assíncrono para a sessão inteira, caro de criar, criado uma vez.
- **Teardown por `yield`** — a fixture cede o valor e retoma no finalizador; `pg_engine` faz `yield engine` e depois `await engine.dispose()` (`postgres.py:63-64`).
- **Compartilhamento por `conftest.py`** — fixtures em `conftest.py` ficam visíveis à árvore de testes sem import; o LUC ainda registra o módulo de suporte como plugin via `pytest_plugins = ["tests.support.postgres"]` ([`apps/api/tests/conftest.py:7`](../../apps/api/tests/conftest.py)).

### 4.2 `parametrize` = mesma função, N casos, N relatórios

[A doc](https://docs.pytest.org/en/stable/how-to/parametrize.html): `@pytest.mark.parametrize(argnames, argvalues)` "enables parametrization of arguments for a test function" — roda a função uma vez por conjunto e **cada conjunto vira um caso reportado separadamente** (com seu próprio id).

Achado do repo, e é doutrinário: `parametrize` aparece em **exatamente um** arquivo da suíte inteira (`tests/whatsapp/adapters/test_payment_proposal_repo.py`) — ✔ verificado por grep. O CLAUDE.md explica: "No porte do oráculo TS: um teste por caso, ordem preservada (`parametrize` só em teste novo)." Consequência visível: `tests/shared/domain/test_money.py` tem **19 funções `test_` separadas** em vez de uma parametrizada (✔ verificado por `--collect-only`). A doutrina do repo prefere legibilidade-por-nome e paridade 1:1 com o oráculo TS ao açúcar do `parametrize` — uma escolha consciente, não esquecimento.

### 4.3 Markers = anotar e selecionar

[A doc](https://docs.pytest.org/en/stable/how-to/mark.html): `@pytest.mark.<nome>` anexa metadado a um teste. Builtins mais usados: `skip`, `skipif(cond, *, reason=…)`, `xfail`, `usefixtures`. **Markers customizados** devem ser registrados (em `[tool.pytest.ini_options] markers = [...]` ou `pytest_configure`), senão o pytest emite warning. O LUC não precisa registrar nada porque só usa o builtin `skipif` — o gate Seam-2 é `pytest.mark.skipif` ([`apps/api/tests/support/postgres.py:29`](../../apps/api/tests/support/postgres.py)) aplicado no módulo via `pytestmark = requires_postgres` ([`test_bill_repo.py:21`](../../apps/api/tests/finance/adapters/test_bill_repo.py)).

### 4.4 pytest-asyncio: `auto` × `strict`

[Concepts](https://pytest-asyncio.readthedocs.io/en/stable/concepts.html): há dois modos.

- **strict** (padrão do plugin) — só roda testes marcados com `@pytest.mark.asyncio` e só adota fixtures decoradas com `@pytest_asyncio.fixture`. Esquecer o marker → o teste **não é tratado** (silenciosamente não roda como async). Serve a projetos que misturam bibliotecas async.
- **auto** — o plugin **adiciona o marker `asyncio` a toda função de teste assíncrona** automaticamente e assume todas as fixtures async, decoradas ou não. É o modo recomendado para quem usa só asyncio.

O LUC está em **`asyncio_mode = "auto"`** ([`apps/api/pyproject.toml:90`](../../apps/api/pyproject.toml)). ✔ **Verificado por experimento**: `uv run pytest` roda **535 testes** que são puros `async def test_...` sem nenhum `@pytest.mark.asyncio` (ex.: `test_bill_repo.py`, `test_create_bill.py`). Em strict, todos seriam silenciosamente pulados. O modo auto é o que faz a convenção "corpo AAA, `async def`, sem decorator" do repo funcionar.

---

## 5. Integração com infra real

### 5.1 Testcontainers — o padrão de indústria

Definição oficial ([testcontainers.com](https://testcontainers.com/getting-started/), verbatim):

> "Testcontainers is a library that provides easy and lightweight APIs for bootstrapping local development and test dependencies with real services wrapped in Docker containers."

E o **porquê** dele, que a doc oficial coloca em cima da mesa e amarra direto na §3: mocks e serviços in-memory "may lack features of production systems and behave differently"; testcontainers roda o serviço **de verdade** (Postgres, Kafka, MinIO…) num container descartável, eliminando a discrepância. Suporte a Python via [`testcontainers-python`](https://testcontainers-python.readthedocs.io/). O ciclo é: sobe container no setup → devolve host/porta → teste conecta no serviço real → derruba no teardown.

**Alternativas ao testcontainers** (o campo, não só a marca):

- **docker-compose + gate por env** — subir os serviços fora do processo de teste (compose no dev, service containers no CI) e a suíte **conecta se a env disser onde**, skipando/errando se não. É o que o LUC faz. Mais simples, menos mágica; o custo é a suíte não gerenciar o ciclo de vida do container e depender de disciplina de ambiente.
- **SQLite in-memory no lugar do Postgres** — rápido, zero infra; mas é um **Fake** com dialeto diferente, e volta ao problema da §3 (não pega CAS, tipos `uuid`, `on conflict`, índice parcial). O LUC rejeita isso implicitamente ao testar o `SqlBillRepo` contra Postgres real.
- **Serviço embutido/efêmero por linguagem** (ex.: `pytest-postgresql`, Testcontainers-less harnesses) — meio-termo.
- **Fake mantido pelo fornecedor** (ex.: emulador oficial) — bom quando existe; raro.

### 5.2 O que o LUC faz: Seam-2, gate por `DATABASE_URL`

O padrão do repo está declarado no docstring de [`apps/api/tests/support/postgres.py:1`](../../apps/api/tests/support/postgres.py): espelha a convenção Seam-2 do `apps/web` (os `*.drizzle.test.ts`) — "a suíte skipa localmente sem `DATABASE_URL` e só roda onde o service `postgres:16-alpine` do CI está de pé". O mecanismo é enxuto:

```python
# apps/api/tests/support/postgres.py:27
DATABASE_URL = os.environ.get("DATABASE_URL")

requires_postgres = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL not set; Seam-2 runs against Postgres real only in CI"
)
```

Cada arquivo de adapter aplica `pytestmark = requires_postgres` no topo (ex.: `test_bill_repo.py:21`). Detalhes de projeto que valem registro, todos verificados no arquivo:

- **Schema legado replayado uma vez por sessão** e idempotente — `_ensure_legacy_schema` só aplica as 13 migrations SQL se `households` ainda não existe (`postgres.py:47-54`), porque aplicá-las duas vezes colidiria (`relation already exists`).
- **Identidade fresca por teste** — `create_household`/`create_user` cunham `uuid4()` a cada chamada (`postgres.py:67-88`); o docstring cita a lição da suíte Drizzle Seam-2: "every test here must mint fresh ids, never reuse a literal UUID across runs" (senão reruns contra o mesmo Postgres longevo colidem em `23505`).

✔ **Verificado por experimento** (`env -u DATABASE_URL uv run pytest`): sem `DATABASE_URL`, **60 testes skipam** com exatamente aquela razão; os 535 use-case/domínio (fakes, sem DB) passam.

### 5.3 A inconsistência do gate — R2/MinIO erra em vez de skipar

Achado concreto, e é um contraste útil sobre a fragilidade do padrão "gate por env": nem todo teste de infra real do LUC tem o gate. O round-trip do attachment store fala com **MinIO** (S3-compatível) e **não** tem um `requires_*` equivalente. A fixture `bucket_ready` ([`apps/api/tests/finance/adapters/test_r2_attachment_store.py:57`](../../apps/api/tests/finance/adapters/test_r2_attachment_store.py)) tenta `create_bucket` contra `http://127.0.0.1:9000` incondicionalmente; o `except ClientError` **não** captura `EndpointConnectionError`, então, sem MinIO de pé, o setup **estoura**.

✔ **Verificado por experimento**: a mesma rodada acima terminou em `535 passed, 60 skipped, **3 errors**` — os 3 erros são os round-trips do R2 batendo em MinIO ausente. Ou seja: **Postgres skipa limpo, R2 erra**. No CI os dois serviços sobem, então lá tudo roda; localmente sem `pnpm dev:up`, o Postgres degrada elegante e o R2 quebra a suíte. É uma inconsistência cosmética (não é bug de produção), mas ilustra bem o custo do padrão que o LUC escolheu no lugar do testcontainers: **o gate é responsabilidade de cada teste, e um esquecimento não falha o build, degrada a experiência local**. Testcontainers, por gerenciar o ciclo de vida, não teria esse buraco — a um custo de mais dependência e mágica.

---

## 6. Cobertura — o que a métrica mede e o que ela não promete

### 6.1 O que Coverage.py mede (e só)

[Coverage.py](https://coverage.readthedocs.io/) mede **cobertura de statement** (quais linhas executaram) e, opcionalmente, **cobertura de branch**. A doc de [branch coverage](https://coverage.readthedocs.io/en/latest/branch.html) é precisa sobre a mecânica: o coverage registra **pares (origem, destino)** de transições de linha; a análise estática dá as transições *possíveis*; a diferença são os branches faltantes. Um corolário que a própria doc dá: **100% de linha não implica 100% de branch** — dá para executar toda linha de um `if` sem nunca avaliá-lo como falso, e aí a linha "conta" mas o ramo não-tomado fica descoberto. E há um cego conhecido: branches na *mesma linha* (`if x > 0: print(...)`) não geram transição, então o coverage não os detecta.

O ponto doutrinário: cobertura mede **execução**, não **verificação**. Ela responde "esta linha rodou durante os testes?"; **não** responde "algum assert falharia se esta linha estivesse errada?". Um teste sem um único `assert` que só chama a função dá 100% de cobertura e zero garantia.

### 6.2 O que ela não garante — a fonte

Fowler, [bliki: TestCoverage](https://martinfowler.com/bliki/TestCoverage.html), é a referência canônica (verbatim):

> "If you make a certain level of coverage a target, people will try to attain it. […] high coverage numbers are too easy to reach with low quality testing […] I would be suspicious of anything like 100% - it would smell of someone writing tests to make the coverage numbers happy, but not thinking about what they are doing."

E o uso *legítimo* da métrica, também dele (verbatim):

> "it helps you find which bits of your code aren't being tested."

Ou seja: cobertura é **diagnóstico** (achar código sem teste nenhum), não **meta** (número a bater). Ele cita Brian Marick: "I expect a high level of coverage. Sometimes managers require one. There's a subtle difference" — a diferença entre *esperar* e *exigir*.

### 6.3 O contraponto que mede qualidade: mutation testing

A técnica que mede o que a cobertura não mede nasceu em 1978: **DeMillo, Lipton & Sayward, "Hints on Test Data Selection: Help for the Practicing Programmer"** (*Computer*, IEEE) — a primeira formalização da *mutation analysis* (a ideia é atribuída a Richard Lipton ainda em 1971; a primeira ferramenta foi a tese de Timothy Budd, 1980). Fontes: [Wikipedia: Mutation testing](https://en.wikipedia.org/wiki/Mutation_testing) e o survey [Papadakis et al., "Mutation Testing Advances"](https://arxiv.org/abs/1703.02310) **[secundárias]**; o artigo de 1978 é a primária-dona.

A mecânica: a ferramenta injeta **mutantes** — defeitos artificiais e pequenos no código (`+` vira `-`, `<` vira `<=`, `return x` vira `return None`) — via **operadores de mutação**, e roda a suíte contra cada mutante. Se algum teste falha, o mutante foi **morto**; se todos passam, o mutante **sobreviveu** — e um sobrevivente é uma prova de que *aquela* mudança de comportamento não é detectada por nenhum assert. O **mutation score** é a fração de mutantes mortos. É o inverso conceitual da cobertura: cobertura pergunta "o teste *toca* esta linha?"; mutation pergunta "o teste *detecta* se esta linha estiver errada?".

Ferramentas em Python (docs oficiais): [`mutmut`](https://mutmut.readthedocs.io/) e [`cosmic-ray`](https://cosmic-ray.readthedocs.io/). O custo é tempo: rodar a suíte inteira uma vez por mutante é caro; por isso na prática se aponta mutation testing a **módulos de alto valor** (o domínio puro), não ao repo todo.

### 6.4 O LUC hoje

Nenhum dos dois. ✔ Verificado no `pyproject.toml`: **sem `pytest-cov`/`coverage`**, **sem `mutmut`/`cosmic-ray`**, sem `hypothesis`. As dev deps são `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `pyright`, `import-linter`, `boto3-stubs`. O gate `pr-checks` roda ruff + pyright strict + import-linter + pytest — **nenhuma métrica de teste** (nem cobertura, nem mutação).

**[opinião]** É uma ausência coerente com o momento: o valor de cobertura é diagnóstico e o repo é pequeno o bastante para saber o que não tem teste sem a métrica; o valor de mutation é altíssimo mas caro, e faz mais sentido apontado ao **domínio puro** (`finance/domain`, `shared/domain` — funções sobre `int`/`date`, determinísticas, baratas de mutar) quando/se surgir dúvida sobre a força da suíte. Nada disso é dívida urgente. Se um dia entrar uma métrica, que entre como **diagnóstico** (Fowler §6.2) — jamais como número-alvo no gate.

---

## 7. Síntese para um backend assim

O que a doutrina séria prescreve, cruzado com o que o LUC já faz:

1. **Fakes de port + verificação de estado como norma; mocks como exceção rara.** É o classicismo de Fowler e é o que o LUC pratica (§2). Correto para um núcleo hexagonal — mantém o teste acoplado ao *resultado*, não à *interação*, e sobrevive a refactor. ✔ alinhado.
2. **Um contract test onde há uma fronteira com o real.** O `test_metadata_fidelity` já cobre a fronteira mais perigosa (modelo de schema × schema migrado). O gap é a **suíte-única-contra-fake-e-real** do padrão IntegrationContractTest (§3.3) — barato de adotar quando um segundo adapter do mesmo port aparecer; hoje o contrato é mantido por duplicação disciplinada. **[opinião]** vale a pena no primeiro port com 2+ adapters.
3. **Infra real de verdade nos testes de adapter — nunca SQLite-como-Postgres.** ✔ o LUC testa contra Postgres real (Seam-2). A escolha "compose + gate por env" em vez de testcontainers é legítima; o preço é o gate ser por-teste e inconsistente (§5.3 — R2 erra sem MinIO). **[opinião]** unificar o gate (um `requires_minio` espelhando `requires_postgres`) fecharia a assimetria com uma linha.
4. **Cobertura como diagnóstico, nunca como meta; mutation como bisturi no domínio puro.** O LUC não usa nenhum e isso é defensável agora (§6.4). Se a força da suíte virar dúvida, mutation em `*/domain` responde melhor que cobertura.

O fio condutor de tudo: **tipo prova forma; teste contra o real prova comportamento; e cobertura prova execução — nenhum dos três prova os outros dois.** A doutrina madura é saber qual pergunta cada ferramenta responde e não pedir a uma o que só a outra dá.

---

## Fontes

**Primárias — donas do conceito:**

- Gerard Meszaros, *xUnit Test Patterns* — [Test Double](http://xunitpatterns.com/Test%20Double.html), [Fake Object](http://xunitpatterns.com/Fake%20Object.html), [Test Stub](http://xunitpatterns.com/Test%20Stub.html), [Test Spy](http://xunitpatterns.com/Test%20Spy.html), [Mock Object](http://xunitpatterns.com/Mock%20Object.html) (site HTTP-only; texto lido direto do HTML).
- Martin Fowler — ["Mocks Aren't Stubs"](https://martinfowler.com/articles/mocksArentStubs.html), [bliki: Test Double](https://martinfowler.com/bliki/TestDouble.html), [bliki: IntegrationContractTest](https://martinfowler.com/bliki/IntegrationContractTest.html), [bliki: ContractTest](https://martinfowler.com/bliki/ContractTest.html), [bliki: TestCoverage](https://martinfowler.com/bliki/TestCoverage.html).
- DeMillo, Lipton & Sayward, "Hints on Test Data Selection: Help for the Practicing Programmer", *Computer* 11(4), 1978 — origem do mutation testing.

**Primárias — docs oficiais de ferramenta:**

- pytest — [Fixtures](https://docs.pytest.org/en/stable/how-to/fixtures.html), [Parametrize](https://docs.pytest.org/en/stable/how-to/parametrize.html), [Markers](https://docs.pytest.org/en/stable/how-to/mark.html).
- pytest-asyncio — [Concepts (auto × strict)](https://pytest-asyncio.readthedocs.io/en/stable/concepts.html), [Configuration](https://pytest-asyncio.readthedocs.io/en/stable/reference/configuration.html).
- Testcontainers — [Getting started](https://testcontainers.com/getting-started/), [testcontainers-python](https://testcontainers-python.readthedocs.io/).
- Coverage.py — [Índice](https://coverage.readthedocs.io/), [Branch coverage](https://coverage.readthedocs.io/en/latest/branch.html).
- Mutation testing em Python — [mutmut](https://mutmut.readthedocs.io/), [cosmic-ray](https://cosmic-ray.readthedocs.io/).

**Secundárias (rotuladas [secundária]/[opinião] no texto):**

- [Wikipedia: Mutation testing](https://en.wikipedia.org/wiki/Mutation_testing) — cronologia (Lipton 1971, Budd 1980).
- Papadakis et al., ["Mutation Testing Advances: An Analysis and Survey"](https://arxiv.org/abs/1703.02310).

**Evidência do repo (verificada por leitura/experimento em `apps/api`):**

- Fake+Spy de port: `tests/finance/application/test_create_bill.py:17`. Adapter real (par do fake): `tests/finance/adapters/test_bill_repo.py:24`.
- Stub de relógio em produção: `src/luc_api/shared/application/clock.py:27`.
- Contract test de schema: `tests/shared/adapters/db/test_metadata_fidelity.py:1`.
- Gate Seam-2: `tests/support/postgres.py:27`; aplicação: `tests/finance/adapters/test_bill_repo.py:21`. Infra sem gate (R2/MinIO): `tests/finance/adapters/test_r2_attachment_store.py:57`.
- Config pytest/asyncio: `pyproject.toml:88` (`asyncio_mode = "auto"`, `testpaths`).
- Experimento (`env -u DATABASE_URL uv run pytest`): `535 passed, 60 skipped, 3 errors` — skips = gate Postgres, errors = R2 sem MinIO.
