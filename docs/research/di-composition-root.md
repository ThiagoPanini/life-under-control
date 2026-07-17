# Padrão Python — DI e composition root

> Research do ticket [#226](https://github.com/ThiagoPanini/life-under-control/issues/226) (mapa wayfinder #219). Pergunta: **quais são as formas reais de wiring de dependências em Python/FastAPI, o que cada uma garante e custa sob pyright strict, e de onde vem o pattern?**

## Método e escopo

Cada afirmação de fato tem uma **fonte primária** dona (doc oficial do mecanismo/lib, ou o artigo original do conceito) com link; leituras de terceiros ou juízo meu vêm rotulados **[opinião]**. Toda afirmação de comportamento sob type-check ou runtime foi **verificada por experimento** contra as versões pinadas do repo, com script e output colados abaixo. O foco é o *como* de cada mecanismo — não recenseio codebases (isso é do radar irmão).

Versões pinadas no experimento (de `apps/api`, `uv sync` na `uv.lock` atual, 17/07/2026): Python 3.14.4 · FastAPI 0.139.0 · Starlette 1.3.1 · Pydantic 2.13.4 · pyright 1.1.411 (`typeCheckingMode = "strict"`, `pyproject.toml`).

## TL;DR

O `apps/api` pratica **composition root manual + Pure DI** (wiring à mão, sem container) com **ports estruturais** (`typing.Protocol`) e use-cases que são funções puras recebendo os ports por parâmetro. Sob pyright strict isso tem uma propriedade que nenhum dos outros mecanismos entrega: **o seam de substituição (port ⇄ adapter) é verificado estaticamente** — trocar um adapter que não satisfaz o port é erro de compilação, tanto na factory `provide_*` quanto no call-site do use-case (Exp 1). O `Depends` do FastAPI **não** verifica esse seam: `Depends(f)` é `Any`, a anotação do parâmetro é *confiada* e o retorno do provider nunca é cruzado com ela; `dependency_overrides` é um `dict` não tipado (Exp 2). O `Depends` é ótimo no que foi feito pra fazer — resolver *coisas do request* na borda HTTP, com cache por request e teardown via `yield` (Exp 3) — e é exatamente por isso que ele fica **preso à borda** e não deve carregar as dependências de domínio (ADR-0014). Containers (dependency-injector, punq, wireup, svcs) compram *lifecycle automático*, *registro centralizado* e, no caso do wireup, *validação fail-fast do grafo no boot* — coisas reais, mas que para um grafo pequeno e explícito como o do LUC custam mais indireção do que resolvem. **[opinião]**

## 1. De onde vem o pattern (fontes primárias)

### 1.1. IoC é genérico demais; o nome preciso é "Dependency Injection" — Fowler (2004)

O termo nasce no ensaio de Martin Fowler [*Inversion of Control Containers and the Dependency Injection pattern*](https://martinfowler.com/articles/injection.html). A tese de nomenclatura: "Inversion of Control is a common characteristic of frameworks, so saying that these lightweight containers are special because they use inversion of control is like saying my car is special because it has wheels." A inversão específica desses containers é *como resolvem a implementação de um plugin* — e, por ser específica, mereceu nome próprio: "with a lot of discussion with various IoC advocates we settled on the name *Dependency Injection*."

**As três formas de injeção** (Fowler): **Constructor Injection** (dependências pelos parâmetros do construtor), **Setter Injection** (por métodos setter) e **Interface Injection** (por métodos de uma interface dedicada) — na taxonomia antiga, respectivamente type 3, type 2 e type 1 IoC.

**Service Locator vs Dependency Injection** (Fowler, mesmo artigo): "With service locator the application class asks for it explicitly by a message to the locator. With injection there is no explicit request, the service appears in the application class — hence the inversion of control." E o custo do locator: "with a Service Locator every user of a service has a dependency to the locator" — o locator vira dependência universal e esconde o que cada classe realmente precisa. Essa distinção é a chave para ler `svcs` (§4.2), que é assumidamente um *service locator*.

### 1.2. Composition Root — Seemann (2011)

A âncora arquitetural é o [*Composition Root* de Mark Seemann](https://blog.ploeh.dk/2011/07/28/CompositionRoot/): "A Composition Root is a (preferably) unique location in an application where modules are composed together." Onde: "as close as possible to the application's entry point". Disciplina: "A DI Container should only be referenced from the Composition Root. All other modules should have no reference to the container" — o resto do código "rely solely on Constructor Injection (or other injection patterns), but is *never composed*". E o limite: "Only applications should have Composition Roots. Libraries and frameworks shouldn't."

Lido no LUC: `create_app` **é** o Composition Root, e o corolário "só o entry-point compõe" é o que justifica os `provide_*` viverem num único módulo (`composition.py`) e o resto do domínio nunca ver como se monta.

### 1.3. Pure DI (ex-"Poor Man's DI") — Seemann (2014)

O nome do que o `apps/api` faz é [*Pure DI*, de Seemann](https://blog.ploeh.dk/2014/06/10/pure-di/): "Pure DI is when you use the DI principles and patterns, but not a DI Container" — as dependências são cabeadas à mão no composition root. Seemann rebatizou o conceito (antes "Poor Man's DI") justamente para matar a conotação de inferioridade: o nome velho "sounds slightly derogatory... it doesn't communicate the message that DI without a DI Container is, in many cases, *better* than DI with a DI Container." Fecho de princípio, do mesmo autor: "DI is a set of principles and patterns; DI Containers are *optional* helper libraries." Ou seja: **DI ≠ container**; o container é ferramenta opcional, e abrir mão dele é uma escolha legítima (e frequentemente melhor), não uma falta.

## 2. O que o `apps/api` pratica hoje (Pure DI + ports estruturais)

Leitura do código, com `arquivo:linha` (caminhos a partir de `apps/api/src/luc_api/`):

**O composition root é `create_app`.** `main.py:13` — `def create_app(settings: Settings | None = None) -> FastAPI`; monta o app, registra routers e handlers; `main.py:30` — `app = create_app()` é o único ponto onde tudo se junta. O `settings` entra por **constructor injection no composition root** (parâmetro opcional; em teste passa-se explícito), guardado em `app.state.settings` (`main.py:23`).

**Uma factory `provide_*` por port, sem container.** `composition.py:1` diz na própria docstring: "provide_* factories, one per port — no DI container", e `composition.py:5` nomeia a propriedade-chave: "The annotated return type is where pyright validates the adapter's structural adherence to the port". Concretamente `composition.py:14` — `def provide_clock() -> Clock: return SystemClock()`: o tipo de retorno anotado (`Clock`) é o **seam** onde o pyright confere que `SystemClock` satisfaz o port (Exp 1 prova que um adapter torto barra aqui).

**Ports são `Protocol` estruturais** (não classe-base; ADR-0015 proíbe base classes de DDD). Ex.: `shared/application/clock.py:14` — `class Clock(Protocol)`; `finance/application/payment_repo.py:23` — `class PaymentRepo(Protocol)`. O adapter (`shared/adapters/system_clock.py:18`, `class SystemClock`) **não herda** de `Clock`; adere por forma. Um port pode inclusive ser um `Callable` puro: `whatsapp/application/conta_matcher.py:24` — `type ContaMatcher = Callable[[str | None, list[BillOption]], Awaitable[list[str]]]`. O fake de teste mora ao lado do port (`FixedClock` em `clock.py:22`; `FakePaymentRepo` em `payment_repo.py:49`).

**Use-cases são funções puras que recebem os ports por parâmetro** — constructor injection na forma funcional. `finance/application/record_payment.py:21` — `async def record_payment(repo: PaymentRepo, clock: Clock, household_id, bill_id, raw)`. Quando a aridade cresce, os ports viram um **bundle `@dataclass`**: `whatsapp/application/respond_to_proposal.py:181` — `@dataclass class ResponderDeps` com `proposal_repo`, `payment_repo`, `attachment_repo`, `bill_repo`, `matcher`, `store`, `messenger`, `clock`, `calendar`. E há **Interface Segregation** estrutural: em vez de exigir o `BillRepo` inteiro, o use-case declara a fatia estreita que usa — `respond_to_proposal.py:173` — `class BillLister(Protocol)` ("the narrow slice of BillRepo this use-case needs").

**`Depends` do FastAPI aparece só na borda, e só para identidade.** O único uso em todo o `apps/api`: `http/identity.py:80` — `CurrentIdentity = Annotated[Identity, Depends(current_identity)]`, resolvendo *quem age* a partir do JWT do request (`http/identity.py:35`, `def current_identity(request: Request) -> Identity`), consumido em `http/me.py:13`. Note que até o `settings` **não** passa por `Depends`: é lido de `request.app.state.settings` (`http/identity.py:53`). Ou seja, `Depends` é usado para a *única coisa que é genuinamente do request* (o token), não para cabear domínio.

**Testes injetam no composition root e usam fakes — zero `dependency_overrides`.** Grep confirmou: `dependency_overrides` não aparece em `apps/api` (nem `src` nem `tests`). Testes de borda passam a config pelo construtor do root: `tests/http/test_identity.py:32` e `tests/http/test_problems.py:75` — `create_app(settings=Settings(jwt_secret=...))`. Testes de use-case constroem os fakes à mão e passam por parâmetro (`FakePaymentRepo`, `FixedClock`). O substituto de teste é o mesmo mecanismo do substituto de produção: **passar outro objeto que satisfaz o port** — nada de gancho de framework.

## 3. `Depends` do FastAPI como mecanismo de DI

### 3.1. O que ele resolve (docs primárias)

Pela doc oficial [FastAPI · Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/): declara-se com `Annotated[T, Depends(func)]`, passando a função **sem chamar** ("you don't call it directly... you just pass it as a parameter to `Depends()`"). A cada request, "FastAPI will take care of: calling your dependency function with the correct parameters; get the result from your function; assign that result to the parameter in your path operation function." Dependências podem ser funções ou classes/callables (classes-as-dependencies).

**Cache por request.** [FastAPI · Sub-dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/sub-dependencies/): "If one of your dependencies is declared multiple times for the same path operation... FastAPI will know to call that sub-dependency only once per request. And it will save the returned value in a 'cache' and pass it to all the 'dependants' that need it in that specific request." Dá pra desligar: `Depends(func, use_cache=False)` força chamar toda vez. **Verificado no Exp 3.**

**Dependencies com `yield` (setup/teardown).** [FastAPI · Dependencies with yield](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/): "Only the code prior to and including the `yield` statement is executed before creating a response"; "The code following the `yield` statement is executed after the response". Padrão canônico com `try/finally` (sessão de banco); a saída de sub-dependências roda em ordem reversa. **Ordem verificada no Exp 3** (`setup → handler → teardown`).

**Override em teste.** [FastAPI · Testing Dependencies](https://fastapi.tiangolo.com/advanced/testing-dependencies/): "your FastAPI application has an attribute `app.dependency_overrides`, it is a simple `dict`"; chave = dependência original, valor = substituta; `app.dependency_overrides = {}` limpa. É a via oficial para trocar uma dependência **só em teste**.

### 3.2. O que ele acopla à borda HTTP

`Depends` é um mecanismo do *request lifecycle* do Starlette/FastAPI: só é resolvido quando há um request passando por um path operation. Um use-case que declarasse `param: Annotated[X, Depends(...)]` estaria, por construção, amarrado ao framework de borda — exatamente o que o ADR-0014 proíbe ("use-cases never see HTTP nor token"). Por isso, no LUC, `Depends` fica **na borda** e injeta só o que é do request (o `Identity` derivado do JWT); o wiring das dependências de domínio é feito **fora** dele, no composition root manual.

### 3.3. Experimento — o que o pyright vê através de `Depends` vs. do seam manual

**Exp 1 — o seam manual É type-checado.** Um port `Protocol`, um adapter bom e um torto (expõe `now()` em vez de `today()`). O torto é rejeitado nos dois lugares onde o LUC o usaria: na factory `provide_*` (retorno anotado) e no call-site do use-case.

```python
# exp1_manual_seam.py (trecho)
class Clock(Protocol):
    def today(self) -> date: ...
class BadClock:
    def now(self) -> date: return date(2026, 7, 17)   # forma errada
def provide_clock_bad() -> Clock:
    return BadClock()                                  # (a)
def use_case(clock: Clock) -> date:
    return clock.today()
use_case(BadClock())                                   # (b)
```

`uv run pyright exp1_manual_seam.py`:

```
:32:12 - error: Type "BadClock" is not assignable to return type "Clock"
    "BadClock" is incompatible with protocol "Clock"
      "today" is not present (reportReturnType)
:40:10 - error: Argument of type "BadClock" cannot be assigned to parameter "clock" of type "Clock" in function "use_case"
    "BadClock" is incompatible with protocol "Clock"
      "today" is not present (reportArgumentType)
2 errors, 0 warnings, 0 informations
```

Ou seja: **(a)** a factory e **(b)** o use-case pegam o adapter torto em type-check. Esse é o dividendo do wiring manual sob pyright strict.

**Exp 2 — o seam de `Depends` NÃO é type-checado.** Um provider que devolve `str` é aceito onde a anotação diz `Clock`; a anotação é *confiada* e o retorno do provider é ignorado; `dependency_overrides` é um `dict` sem tipos.

```python
# exp2_depends_blind.py (trecho)
def provide_str() -> str: return "not a clock"          # NÃO é um Clock
val = Depends(provide_str)
reveal_type(val)                                        # (a)
@app.get("/x")
def handler(clock: Annotated[Clock, Depends(provide_str)]) -> None:
    reveal_type(clock)                                  # (b)  sem erro!
    _ = clock.today()
reveal_type(app.dependency_overrides)                   # (c)
app.dependency_overrides[provide_str] = override_returns_int   # (d) int no lugar de Clock
```

`uv run pyright exp2_depends_blind.py`:

```
:23:13 - information: Type of "val" is "Any"
:31:17 - information: Type of "clock" is "Clock"
:39:13 - information: Type of "app.dependency_overrides" is "dict[(...) -> Any, (...) -> Any]"
0 errors, 0 warnings, 3 informations
```

Leitura: **(a)** `Depends(f)` é `Any` — o seam não carrega tipo; **(b)** o parâmetro é visto como `Clock` mesmo com o provider devolvendo `str`, e **não há erro** — o cruzamento provider⇄anotação nunca acontece; **(c)/(d)** `dependency_overrides` é `dict[(...)->Any, (...)->Any]`, então trocar por uma callable de assinatura incompatível também passa limpo. (Nuance: no idiom *classes-as-dependencies*, `Depends(MinhaClasse)` "casa" o tipo só porque o humano escreveu a mesma classe nos dois lados — não porque o pyright validou a substituição; para port⇄adapter, que é o caso do LUC, esse casamento não existe.)

**Exp 3 — cache por request e ordem do `yield` (runtime).** Uma sub-dependência contada, usada por dois dependentes no mesmo request; um endpoint com `use_cache=False`; e uma dependência `yield` que registra ordem.

`uv run python exp3_runtime.py`:

```
cached req1 body: {'a': 1, 'b': 1} | counted_dep calls: 1 | order: ['setup', 'handler', 'teardown']
cached req2 body: {'a': 2, 'b': 2} | counted_dep calls total (2 reqs): 2
nocache body: {'a': 1, 'b': 2} | counted_nocache calls (1 req): 2
```

Leitura: no request 1 a sub-dependência roda **1 vez** e o valor é compartilhado (`a==b==1`); o request 2 recomeça a contagem (cache é **por request**, não global → total 2 em 2 requests); com `use_cache=False` ela roda **2 vezes** no mesmo request (`a=1,b=2`); e o teardown do `yield` roda **depois** do handler (`setup → handler → teardown`).

### 3.4. Veredito sobre `Depends`

`Depends` é um bom mecanismo de DI **para a borda**: resolve coisas-do-request, com cache e teardown certos, e o override oficial cobre teste de borda. O custo é duplo: (1) acopla ao ciclo HTTP quem o usa; (2) o wire em si é *type-blind* sob pyright strict — a segurança fica por conta da disciplina de escrever a mesma anotação nos dois lados, não do checker. No LUC, ambos os custos são evitados mantendo `Depends` só na borda e cabeando domínio no composition root manual.

## 4. Containers, service locators e factories — o que compram DE VERDADE

### 4.1. Factories simples (o que o repo já usa)

As `provide_*` são factories: função → objeto pronto, com o tipo de retorno como contrato. Compram **um ponto único de construção por port** e o **seam type-checado** (§3.3, Exp 1), com custo zero de dependência e zero de mágica. O que **não** compram: gestão automática de ciclo de vida (singleton/escopo/cleanup) e resolução transitiva automática do grafo — nesse modelo, quem chama monta a ordem à mão.

### 4.2. `svcs` (Hynek Schlawack) — service locator com lifecycle

Fonte primária: [README do `hynek/svcs`](https://github.com/hynek/svcs). Auto-descrição: "a dependency container for Python... suitable for implementing Inversion of Control using either dependency injection or service location", com tagline "A Flexible Service Locator for Python". O núcleo é *locate por tipo* com type-safety estático: `db, api, cache = svcs_from(request).get(Database, WebAPIClient, Cache)` e "To a type checker, `db` has the type `Database`..." — mas o próprio README avisa que "svcs also doesn't check your types at runtime. It only forwards the type you have asked for to the type checker" (i.e. o `get(T) -> T` é uma *promessa* tipada, não uma verificação de que o factory registrado devolve `T`).

O que compra **de verdade** sobre wiring manual: **unifica aquisição e cleanup** ("unifies acquisition and cleanups of services"; "`db`, `api`, and `cache` will be automatically cleaned up when the request ends — it's context managers all the way down"), **instanciação preguiçosa**, e **introspection/health-checks** ("improves live introspection and monitoring with health checks"). Traz integração pronta para FastAPI/Flask/Starlette/etc. Static typing é "strictly optional". Custo/[opinião]: por ser *service locator* (Fowler §1.1), cada consumidor passa a depender do container e o "o que eu preciso" some da assinatura — o oposto do que o LUC ganhou tornando os ports explícitos nos parâmetros. Compensa quando o problema real é **lifecycle de muitos recursos com cleanup por request + health-checks**, não wiring.

### 4.3. `dependency-injector` (ETS-Labs) — container declarativo

Fonte primária: [docs oficiais](https://python-dependency-injector.ets-labs.org/introduction/di_in_python.html). Modelo: um `DeclarativeContainer` com **Providers** (`Singleton`, `Factory`, `Configuration`) que declaram a montagem; injeção via decorator `@inject` + marcadores `Provide[Container.x]`; no composition root chama-se `container.wire(modules=[...])`. Compra **de verdade**: montagem centralizada e declarativa, **escopos** (`Singleton` vs `Factory`), configuração tipada, e **override para teste** de primeira classe — "you patch the interface, not an implementation... a way more stable approach" (`container.x.override(mock)`). Custo/[opinião]: os markers `Provide[...]` acoplam código a um vocabulário do framework e o grafo passa a viver em objetos-provider; é o mais "pesado" da lista e o mais distante da estética "tipos nativos, sem base classes" do ADR-0015.

### 4.4. `punq` — container minimalista

Fonte primária: [README do `bobthemighty/punq`](https://github.com/bobthemighty/punq). "An unintrusive library for dependency injection... No global state / No decorators / No weird syntax applied to arguments." API: `container.register(Port, Adapter)` + `container.resolve(Port)`, com **auto-wiring por anotações de construtor** (lê os tipos do `__init__` e injeta os registrados); "you must explicitly create a container in the entrypoint" (composition root). Compra **de verdade**: **resolução transitiva automática** do grafo por tipo, sem o boilerplate de ordenar as factories à mão — mantendo-se sem decorators nem estado global. Custo/[opinião]: a resolução é em runtime por tipo; o pyright não vê o grafo (um registro faltando é erro de execução, não de compilação) — troca-se o seam estático do wiring manual por conveniência de montagem.

### 4.5. `wireup` — container type-driven, fail-fast

Fonte primária: [README do `maldoinc/wireup`](https://github.com/maldoinc/wireup). "Type-driven dependency injection for Python", lema "if the container starts, it works". O diferencial real é **validação do grafo inteiro na criação do container**: "Wireup validates the dependency graph when the container is created" e pega, **no boot e não em runtime**, dependência faltando, ciclo, registro duplicado, lifetime mal configurado e config ausente. API por `@injectable`/`Injected[T]` + `wireup.create_async_container(...)`; integrações nativas (FastAPI/Django/Flask/…). Compra **de verdade**, sobre wiring manual: essa **checagem fail-fast do grafo** (que o manual só teria se você exercitasse o composition root) somada a auto-wiring e reuso do mesmo grafo entre API/CLI/worker. Custo/[opinião]: a validação é no *startup*, não no *type-check* — é mais tarde que o erro do Exp 1 (que o pyright pega antes de rodar) — e agrega decorators/vocabulário próprio ao código de domínio.

### 4.6. Quadro comparativo

Uma linha por mecanismo. "Seam type-checado" = o pyright pega, em type-check, um adapter que não satisfaz o port no ponto de wiring.

| Mecanismo | Origem/tipo | Seam type-checado (pyright strict) | Lifecycle/cleanup automático | Resolução transitiva do grafo | Validação do grafo | Acopla domínio ao framework |
|---|---|---|---|---|---|---|
| Factories `provide_*` (Pure DI) — LUC hoje | Seemann, Pure DI | **Sim** (Exp 1) | Não (à mão) | Não (à mão) | — | Não |
| `Depends` (FastAPI) | doc FastAPI | **Não** (Exp 2: `Any`) | Sim, por request (`yield`, Exp 3) | Sim (sub-deps) | Em runtime, por request | Sim (borda HTTP) |
| `svcs` | Hynek, service locator | Não (promessa `get(T)->T`, sem check) | **Sim** (context managers) | Não (locate por tipo) | Health-checks em runtime | Sim (locator onipresente) |
| `dependency-injector` | ETS-Labs, container | Não (runtime) | Sim (escopos `Singleton`/`Factory`) | Sim | Em runtime | Sim (markers `Provide`) |
| `punq` | container minimalista | Não (runtime) | Parcial (via registro) | **Sim** (auto-wire por anotação) | Em runtime (`resolve`) | Baixo (sem decorators) |
| `wireup` | container type-driven | Não (validação ≠ type-check) | Sim | Sim | **Sim, fail-fast no boot** | Sim (`@injectable`/`Injected`) |

## 5. Leitura para o `apps/api` [opinião]

O que o LUC já tem é a combinação que o ADR-0014/0015 pede e que Seemann chama de Pure DI: **composition root único** (`create_app`), **ports estruturais** (`Protocol`/`Callable`) e **use-cases como funções puras** recebendo os ports — com o bônus, provado no Exp 1, de que sob pyright strict o *seam de substituição é verificado em compile-time*, coisa que nenhum container e nem o `Depends` entregam. `Depends` está no lugar certo: só na borda, só para o que é do request.

Quando reavaliar (gatilhos, não agora): (a) se o **lifecycle de recursos com cleanup por request** (pools, sessões, clients) virar dor repetida → `svcs` é o encaixe mais barato, e já tem integração FastAPI, sem obrigar o domínio a conhecê-lo; (b) se o **grafo de dependências crescer a ponto de a ordem manual no root ficar frágil** → a validação fail-fast do `wireup` no boot passa a comprar algo real. Enquanto o grafo for pequeno e explícito, adicionar container é trocar um seam que o pyright já guarda por indireção que ele deixa de ver — perda líquida sob a régua strict do repo. O caminho intermediário sem lib nova, se a montagem manual incomodar, é extrair um pequeno módulo de *assembly* que devolve os bundles (`ResponderDeps` etc.) já montados a partir do `Settings`, preservando o seam tipado.

## 6. Fontes

Primárias — conceito:
- Martin Fowler, *Inversion of Control Containers and the Dependency Injection pattern* — https://martinfowler.com/articles/injection.html
- Mark Seemann, *Composition Root* — https://blog.ploeh.dk/2011/07/28/CompositionRoot/
- Mark Seemann, *Pure DI* — https://blog.ploeh.dk/2014/06/10/pure-di/

Primárias — mecanismo/lib:
- FastAPI · Dependencies — https://fastapi.tiangolo.com/tutorial/dependencies/
- FastAPI · Sub-dependencies (cache por request) — https://fastapi.tiangolo.com/tutorial/dependencies/sub-dependencies/
- FastAPI · Dependencies with yield — https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/
- FastAPI · Testing Dependencies (`dependency_overrides`) — https://fastapi.tiangolo.com/advanced/testing-dependencies/
- svcs (Hynek Schlawack) — https://github.com/hynek/svcs
- dependency-injector (ETS-Labs) — https://python-dependency-injector.ets-labs.org/introduction/di_in_python.html
- punq (bobthemighty) — https://github.com/bobthemighty/punq
- wireup (maldoinc) — https://github.com/maldoinc/wireup

Código do repo citado: `apps/api/src/luc_api/main.py`, `composition.py`, `settings.py`, `http/identity.py`, `http/me.py`, `shared/application/clock.py`, `shared/adapters/system_clock.py`, `finance/application/{record_payment,payment_repo}.py`, `whatsapp/application/{respond_to_proposal,conta_matcher}.py`; testes `tests/http/{test_identity,test_problems}.py`.

Experimentos (não commitados; rodados de `apps/api` com a `uv.lock` de 17/07/2026): `exp1_manual_seam.py` (pyright), `exp2_depends_blind.py` (pyright), `exp3_runtime.py` (python) — outputs colados no §3.3.
