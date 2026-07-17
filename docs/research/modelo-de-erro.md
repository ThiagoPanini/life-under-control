# Modelo de erro em Python — exceções semânticas × result objects × `None` como sinal

Research do ticket [#227](https://github.com/ThiagoPanini/life-under-control/issues/227) (mapa wayfinder #219). Pergunta: o que a linguagem doutrina, o que o typing garante em cada forma sob **pyright strict**, e como cada forma se traduz na borda HTTP.

**Toolchain dos experimentos (pinado no repo):** Python **3.14.4** e pyright **1.1.411** (o par que `apps/api/pyproject.toml` fixa: `requires-python = ">=3.14"`, `pyright>=1.1.390`, `typeCheckingMode = "strict"`), instalados via `cd apps/api && uv sync`. A lib `returns` foi medida em ambiente efêmero isolado (`uv run --no-project --with returns --with pyright==1.1.411`), versão **0.28.0** — nunca entrou no lockfile do repo. Todo experiment file rodou fora do worktree (no scratchpad) e nenhum foi commitado; os scripts estão reproduzidos inline abaixo, com o output real.

**Método.** Cada afirmação de _doutrina_ ou _spec_ tem fonte primária linkada (docs do Python, PEP, RFC, artigo original do pattern). Cada afirmação de _comportamento_ do checker foi **verificada por experimento** contra o par pinado — o output do pyright/python é a evidência, não a memória. Fontes secundárias vêm rotuladas **(opinião)**.

---

## 0. Veredito

- Python **doutrina exceção**: EAFP é o estilo idiomático nomeado no próprio glossário da linguagem, e a hierarquia de exceções é infraestrutura de primeira classe. `None` como sinal é doutrina _para ausência_ (lookup que pode não achar). Result object é importado de fora (F#/Rust) — legítimo, mas nada na linguagem o abençoa.
- Sob pyright strict o placar de garantia é claro: **exceção não aparece no tipo de retorno** (não há checked exceptions); **`None` como sinal narrowa trivialmente** (`is not None`); **result object só narrowa se for união discriminada** consumida por `isinstance` / `match` / comparação de identidade contra o literal-tag — e **NÃO por truthiness do `.ok`** (o gotcha real deste repo, reproduzido abaixo).
- O `apps/api` já assentou o desenho coerente: **exceção semântica como modelo primário** (`DomainError` e derivados), traduzida **uma vez** na borda HTTP para `application/problem+json` (RFC 9457), com result object (`Valid`/`Invalid`) usado **só** onde a falha é esperada-e-plural (validação de formulário), consumido por `isinstance` (a forma que narrowa), e `None` para lookup. É exatamente o híbrido que o próprio autor do railway-oriented programming recomenda.
- `returns` (dry-python) paga um imposto concreto sob pyright strict (sem o plugin de mypy): `.bind` vaza `KindN[...]` e dispara `reportUnknownMemberType`; `match Success/Failure` dispara `reportMatchNotExhaustive`. Não compensa para o LUC hoje.

---

## 1. O que a linguagem doutrina

### 1.1 EAFP × LBYL — o estilo tem nome oficial

O [glossário oficial do Python](https://docs.python.org/3/glossary.html) define os dois estilos, e o texto é doutrinário:

> **EAFP** — "Easier to ask for forgiveness than permission. This common Python coding style assumes the existence of valid keys or attributes and catches exceptions if the assumption proves false. This clean and fast style is characterized by the presence of many `try` and `except` statements. The technique contrasts with the **LBYL** style common to many other languages such as C."

> **LBYL** — "Look before you leap. [...] In a multi-threaded environment, the LBYL approach can risk introducing a **race condition** between 'the looking' and 'the leaping'. For example, the code, `if key in mapping: return mapping[key]` can fail if another thread removes _key_ from _mapping_ after the test, but before the lookup. This issue can be solved with locks or by using the EAFP approach."

Leitura: a linguagem **nomeia** EAFP como o estilo "comum" e "limpo e rápido", e cita explicitamente que LBYL tem risco de corrida TOCTOU. A exceção não é um mal necessário em Python — é o mecanismo de fluxo esperado para "a premissa falhou". Isso já inclina o default do desenho para exceção, não para checagem prévia. (Secundárias que dizem o mesmo, **(opinião)**: [Real Python — LBYL vs EAFP](https://realpython.com/python-lbyl-vs-eafp/); [Microsoft for Python — Idiomatic Python: EAFP versus LBYL](https://devblogs.microsoft.com/python/idiomatic-python-eafp-versus-lbyl/).)

O ponto onde EAFP encosta no typing: um `try/except` não muda o tipo de retorno de nada — a exceção é invisível ao checker (§2.1). EAFP é doutrina de _runtime_; o typing não a modela.

### 1.2 Hierarquia de exceções — infraestrutura de primeira classe

A [referência de exceções embutidas](https://docs.python.org/3/library/exceptions.html) firma o contrato da árvore:

- `BaseException` é a raiz. "It is not meant to be directly inherited by user-defined classes (for that, use `Exception`)."
- "programmers are encouraged to derive new exceptions from the `Exception` class or one of its subclasses, and not from `BaseException`." E: "All built-in, non-system-exiting exceptions are derived from this class [`Exception`]. All user-defined exceptions should also be derived from this class."
- Três exceções herdam **direto de `BaseException`** de propósito, para **não** serem pegas por um `except Exception`: `SystemExit` ("so that it is not accidentally caught by code that catches `Exception`"), `KeyboardInterrupt` (mesma razão) e `GeneratorExit` ("technically not an error").

Doutrina prática que isso impõe: **capture `Exception`, nunca `BaseException`** — senão você engole Ctrl-C e `sys.exit()`. E: **modele seus erros de domínio como uma hierarquia** sob `Exception`, para que a borda possa capturar por _categoria_ (a raiz) e o núcleo levante a _folha_. É literalmente o que `apps/api` faz — `DomainError(Exception)` como raiz e `NotFoundError`/`ConflictError`/`ValidationError`/`InvalidInputError` como categorias (`apps/api/src/luc_api/shared/domain/errors.py:17-34`), com a borda capturando a raiz e caminhando o MRO (§5).

### 1.3 Exception groups / PEP 654 — múltiplos erros ao mesmo tempo

A [PEP 654](https://peps.python.org/pep-0654/) (aceita, entregue no 3.11) acrescenta dois tipos (`ExceptionGroup`, `BaseExceptionGroup`) e a sintaxe `except*`. Abstract verbatim:

> "This document proposes language extensions that allow programs to raise and handle multiple unrelated exceptions simultaneously: A new standard exception type, the `ExceptionGroup` [...] A new syntax `except*` for handling `ExceptionGroups`."

**Motivação = concorrência.** O driver foi async: bibliotecas que disparam N tarefas não tinham como propagar N falhas simultâneas; o `MultiError` do Trio expôs a dor e virou solução nativa. Hoje aparece via `asyncio.TaskGroup`. Diferença dos dois tipos (da [ref de exceções](https://docs.python.org/3/library/exceptions.html)): "`BaseExceptionGroup` extends `BaseException` and it can wrap any exception, while `ExceptionGroup` extends `Exception` and it can only wrap subclasses of `Exception`." O construtor faz downgrade automático: "if they are all `Exception` subclasses, it returns an `ExceptionGroup` rather than a `BaseExceptionGroup`."

**Semântica do `except*`** (PEP): "each exception is either handled by exactly one clause (the first one that matches its type) or is reraised at the end." Ou seja, múltiplos `except*` podem disparar do mesmo grupo, e o que ninguém casou é **re-levantado** como grupo residual — não some silenciosamente. Métodos-chave: `subgroup(cond)` e `split(cond) -> (match, rest)`.

**Experimento (runtime, Python 3.14.4).** Script:

```python
def demo_split() -> None:
    try:
        raise ExceptionGroup("two failures", [ValueError("bad value"), KeyError("missing")])
    except* ValueError as eg:
        print("except* ValueError caught:", [str(e) for e in eg.exceptions])
    except* KeyError as eg:
        print("except* KeyError caught:", [str(e) for e in eg.exceptions])

def demo_partial_reraise() -> None:
    try:
        try:
            raise ExceptionGroup("mixed", [ValueError("v"), KeyError("k")])
        except* ValueError:
            print("handled ValueError leg only")
    except ExceptionGroup as residual:
        print("residual propagated:", residual.exceptions)
```

Output:

```
except* ValueError caught: ['bad value']
except* KeyError caught: ["'missing'"]
handled ValueError leg only
residual propagated: (KeyError('k'),)
```

Confirma: cada `except*` recebe **um subgrupo** (não a exceção crua), ambas as pernas disparam do mesmo grupo, e a perna não-tratada (`KeyError`) **re-propaga como grupo residual** em vez de sumir. Isso é o oposto do `except` clássico, que pegaria a primeira e engoliria o resto.

**Relevância para o LUC:** baixa hoje — o `apps/api` não agrega falhas concorrentes numa borda (o webhook do WhatsApp trata uma interação por vez; use-cases levantam uma exceção semântica). Vale saber que existe para o dia em que um fan-out (ex.: enviar N templates de digest) precisar reportar "3 falharam, aqui estão as 3". Até lá, é sobre-engenharia.

---

## 2. Typing de cada forma sob pyright strict — o que o checker garante

Todos os experimentos desta seção rodaram com `# pyright: strict` no topo e um `pyrightconfig.json` com `typeCheckingMode: "strict"`, `pythonVersion: "3.14"`, contra o pyright **1.1.411** pinado. As linhas `reveal_type` viram diagnostics `information` do pyright — o output está reproduzido (com o prefixo de path do scratchpad podado para `arquivo:linha:col`).

### 2.1 Exceção — invisível ao tipo de retorno

Python **não tem checked exceptions** e o typing não modela efeitos de exceção. Uma função que pode levantar tem, no tipo, exatamente o tipo do caminho feliz.

```python
def parse(s: str) -> int:
    return int(s)  # pode levantar ValueError; nada na assinatura diz isso

def caller() -> int:
    n = parse("not-a-number")
    reveal_type(n)   # int — o ValueError possível não faz parte do tipo
    return n
```

Output:

```
naive_none_exceptions.py:39:17 - information: Type of "n" is "int"
```

Consequência de desenho: exceção é **invisível ao chamador em tempo de tipo**. O checker não te obriga a tratá-la, não a lista, não sabe que ela existe. O par disso é o docstring `Raises:` (convenção Google, que o ruff `D` cobra) — a documentação é o único lugar onde o contrato de erro de uma exceção fica visível. É a fraqueza estrutural da forma exceção (o compilador não te lembra de tratar) e simultaneamente sua força ergonômica (não polui assinatura nem obriga cerimônia em cada nível). Result object inverte exatamente esse trade-off: torna a falha **parte do tipo de retorno**, ao custo de ter que carregá-la e desembrulhá-la em cada nível.

### 2.2 `None` como sinal — narrowing trivial

`X | None` é a forma que o typing narrowa de graça: `is not None` colapsa a união.

```python
def use_none(x: int | None) -> int:
    if x is not None:
        reveal_type(x)   # int
        return x
    return 0
```

Output:

```
naive_none_exceptions.py:27:21 - information: Type of "x" is "int"
```

É a forma canônica para **ausência** (lookup que pode não achar). O repo a usa exatamente assim nos ports/repos: `get_by_email(...) -> User | None` (`apps/api/src/luc_api/identity/adapters/user_repo.py:31`), `get_attachment(...) -> Attachment | None` (`apps/api/src/luc_api/finance/application/attachment_repo.py:44`), `get_by_id(...) -> PaymentProposal | None` (`apps/api/src/luc_api/whatsapp/adapters/payment_proposal_repo.py:76`), e em parse que pode não casar: `_parse_free_text_field(...) -> FieldPatch | None` (`apps/api/src/luc_api/whatsapp/application/respond_to_proposal.py:692`). Limite conhecido: `None` carrega **zero informação sobre o porquê** — serve para "não existe / não casou", não para "falhou por causa X, Y e Z". Quando o porquê importa e é plural, sobe para result object ou exceção.

### 2.3 Result object ingênuo (`ok: bool`) — não narrowa nada

O anti-pattern mais comum: uma dataclass com `ok: bool` e campos opcionais. O `bool` não carrega informação de tipo, então o checker nunca sabe que "`ok=True` implica `value` presente".

```python
@dataclass
class NaiveResult:
    ok: bool
    value: int | None
    error: str | None

def use_naive(r: NaiveResult) -> int:
    if r.ok:
        reveal_type(r.value)   # int | None — o tag bool não diz nada
        return r.value         # erro: value pode ser None
    return -1
```

Output:

```
naive_none_exceptions.py:19:21 - information: Type of "r.value" is "int | None"
naive_none_exceptions.py:20:16 - error: Type "int | None" is not assignable to return type "int"
  "None" is not assignable to "int" (reportReturnType)
```

Lição: um result object com tag `bool` é pior que `None` — mesma falta de garantia, mais cerimônia. Se for fazer result, o tag **tem que ser `Literal`** (§2.4) e o consumo tem que ser pela forma que narrowa (§2.5).

### 2.4 Result discriminado com tag `Literal` — e o GOTCHA do `.ok`

Este é o caso do repo. `apps/api/src/luc_api/finance/domain/validation.py:13-34` define uma **união discriminada** com tag `Literal`:

```python
@dataclass(frozen=True)
class Valid[T]:
    value: T
    ok: Literal[True] = field(default=True, init=False)

@dataclass(frozen=True)
class Invalid:
    errors: list[FieldError]
    ok: Literal[False] = field(default=False, init=False)
```

O tag é `Literal[True]`/`Literal[False]`, não `bool` — o material de que uniões discriminadas são feitas. A pergunta que a memória do repo já registrou (#188: "pyright não narrowa truthiness de `.ok`") e que este research **verifica**: `if r.ok:` narrowa o objeto `r`?

Experimento — quatro formas de consumir o mesmo `Result[int] = Valid[int] | Invalid`:

```python
def via_truthiness(r: Result[int]) -> int:
    if r.ok:
        reveal_type(r)      # narrowou para Valid[int]?
        return r.value      # erro se r continua Valid[int] | Invalid
    return -1

def via_ok_is_true(r: Result[int]) -> int:
    if r.ok is True:
        reveal_type(r)
        return r.value
    reveal_type(r)
    return -1

def via_isinstance(r: Result[int]) -> int:
    if isinstance(r, Valid):
        reveal_type(r)
        return r.value
    reveal_type(r)
    return -1

def via_match(r: Result[int]) -> int:
    match r:
        case Valid():
            reveal_type(r)
            return r.value
        case Invalid():
            reveal_type(r)
            return -1
```

Output (podado):

```
result_narrowing.py:29:21 - information: Type of "r" is "Valid[int] | Invalid"
result_narrowing.py:30:18 - error: Cannot access attribute "value" for class "Invalid"
  Attribute "value" is unknown (reportAttributeAccessIssue)
result_narrowing.py:30:16 - error: Type of "value" is partially unknown
  Type of "value" is "int | Unknown" (reportUnknownMemberType)
result_narrowing.py:36:21 - information: Type of "r" is "Valid[int]"     # via_ok_is_true, if
result_narrowing.py:38:17 - information: Type of "r" is "Invalid"        # via_ok_is_true, else
result_narrowing.py:44:21 - information: Type of "r" is "Valid[int]"     # via_isinstance, if
result_narrowing.py:46:17 - information: Type of "r" is "Invalid"        # via_isinstance, else
result_narrowing.py:53:25 - information: Type of "r" is "Valid[int]"     # via_match, case Valid
result_narrowing.py:56:25 - information: Type of "r" is "Invalid"        # via_match, case Invalid
3 errors, 0 warnings, 7 informations
```

**O gotcha, confirmado:** em `via_truthiness`, dentro de `if r.ok:`, o `reveal_type(r)` mostra `r` **ainda como `Valid[int] | Invalid`** — não narrowou — e `r.value` **falha** (`Invalid` não tem `value`). As outras três formas narrowam `r` para `Valid[int]` no ramo positivo (e para `Invalid` no negativo).

**Por que.** Truthiness narrowing do pyright opera sobre a **própria expressão testada**: dentro do `if`, `r.ok` estreita de `Literal[True] | Literal[False]` para `Literal[True]`. Mas o pyright **não retropropaga** "o membro `.ok` é truthy" para "selecione o membro da união cujo `Literal` casa". O narrowing de união discriminada (que seleciona `Valid[int]`) é disparado só por **comparação de igualdade/identidade contra o literal** (`r.ok is True`, `r.ok == True`), por `isinstance`, e por `match` com padrão de classe/valor — truthiness pura não é gatilho. Por isso `if r.ok:` estreita `r.ok` mas deixa `r` intacto, e o acesso a `.value` quebra.

**Como o repo evita o gotcha:** todo consumidor de `Valid`/`Invalid` narrowa por `isinstance(res, Invalid)`, nunca por `if res.ok:` — `create_bill.py:29`, `record_payment.py:34`, `edit_bill.py:36`, `edit_payment.py:35`, `prepare_attachment_upload.py:46`, `import_backfill.py:145` (todos em `apps/api/src/luc_api/finance/application/`). O campo `.ok` acaba **vestigial para o typing** — existe (útil talvez para serialização/leitura humana), mas quem depende dele para narrowar cai no gotcha. Recomendação defensiva: quem for tocar esse código estreita por `isinstance` ou `match`, e trata `if res.ok:` como armadilha.

### 2.5 Designs que narrowam de verdade — isinstance, `is True`, match, TypeGuard/TypeIs

Do experimento acima, três formas narrowam a união discriminada: **`isinstance(r, Valid)`**, **`r.ok is True`** (identidade contra o literal-tag) e **`match`** com `case Valid()`/`case Invalid()`. As três dão narrowing de dois ramos (positivo → `Valid[int]`, negativo → `Invalid`).

Falta a quarta forma: **funções-narrowers explícitas**, TypeGuard (PEP 647) e TypeIs (PEP 742). A diferença entre elas é a garantia no **ramo negativo** e o **requisito de subtipo**. Da [PEP 742](https://peps.python.org/pep-0742/):

> "`TypeIs` can narrow the type in both the `if` and `else` branches of a conditional." | TypeGuard: "When a `TypeGuard` function returns `False`, type checkers cannot narrow the type of the variable at all." | "`TypeIs` requires the narrowed type to be a subtype of the input type, while `TypeGuard` does not."

`TypeIs` é stdlib desde o **Python 3.13** — nativo no 3.14 do repo. Experimento:

```python
def is_ok_guard(r: Result[int]) -> TypeGuard[Ok[int]]:
    return isinstance(r, Ok)

def is_ok_is(r: Result[int]) -> TypeIs[Ok[int]]:
    return isinstance(r, Ok)

def use_guard(r: Result[int]) -> int:
    if is_ok_guard(r):
        reveal_type(r)   # Ok[int]
        return r.value
    reveal_type(r)       # TypeGuard: negativo NÃO estreita
    return -1

def use_is(r: Result[int]) -> int:
    if is_ok_is(r):
        reveal_type(r)   # Ok[int]
        return r.value
    reveal_type(r)       # TypeIs: negativo estreita para Err
    return -1
```

Output:

```
guards.py:31:21 - information: Type of "r" is "Ok[int]"          # TypeGuard, if
guards.py:33:17 - information: Type of "r" is "Ok[int] | Err"    # TypeGuard, else — NÃO estreitou
guards.py:39:21 - information: Type of "r" is "Ok[int]"          # TypeIs, if
guards.py:41:17 - information: Type of "r" is "Err"              # TypeIs, else — estreitou
0 errors, 0 warnings, 4 informations
```

Confirma a PEP 742 letra por letra: `TypeGuard` só estreita no ramo positivo (o negativo continua `Ok[int] | Err`); `TypeIs` estreita nos dois (o negativo vira `Err`). **Regra prática:** para um narrower sobre uma união discriminada, use **`TypeIs`** — o tipo estreitado é subtipo do de entrada, então TypeIs se aplica e dá o brinde do ramo negativo. `TypeGuard` fica para os casos raros em que o predicado produz um tipo que **não** é subtipo da entrada (ex.: `list[object]` → `list[str]`). Para o LUC, porém, nada disso é necessário hoje: `isinstance`/`match` já narrowam sem escrever narrower nenhum. TypeGuard/TypeIs entram só se surgir um predicado de negócio reusado em muitos lugares.

### Resumo do §2 (garantia por forma, sob pyright strict 1.1.411)

| Forma | Falha no tipo de retorno? | Narrowing garantido | Custo |
| --- | --- | --- | --- |
| Exceção semântica | Não (invisível) | — (checker não vê) | contrato só no docstring `Raises:` |
| `X \| None` | Sim | `is not None` (trivial) | não carrega o porquê |
| Result `ok: bool` | Aparente, não real | **nenhum** (anti-pattern) | cerimônia sem garantia |
| Result união discriminada (`Literal` tag) | Sim | `isinstance` / `match` / `is True` — **nunca `if .ok`** | gotcha do `.ok`; desembrulho em cada nível |
| TypeGuard / TypeIs | Sim | positivo (Guard) / ambos (Is) | escrever e manter o narrower |

---

## 3. Railway-oriented programming — origem F#, e o que sobrevive em Python

**Rótulo de origem:** "Railway Oriented Programming" é de **Scott Wlaschin**, apresentado em 2014 e publicado em [fsharpforfunandprofit.com/rop](https://fsharpforfunandprofit.com/rop/) — o contexto é **F#**, onde `Result`/`Either` é tipo nativo da linguagem, o pattern matching é exaustivo por construção, e `>>` / `bind` compõem funções que retornam `Result` sem cerimônia. A analogia do trilho: cada função é um trecho de trilho com duas saídas (sucesso/falha); `bind` conecta trechos de modo que, uma vez na linha de falha, tudo a jusante desvia direto para o fim. É elegante **porque a linguagem foi feita para isso**.

**O que sobrevive à tradução para Python — e o que não.** O conceito (tornar a falha parte do tipo de retorno e compô-la) sobrevive; a **ergonomia** não, porque falta o substrato de F#:

- Python **não tem `Result` nativo** nem exaustividade garantida — o §4 mostra o pyright pedindo `case _` num `match Success/Failure` porque não sabe que a união é selada.
- Python **não tem operador de composição** (`>>`) nem `do`-notation; `bind` vira encadeamento de métodos (`.bind(...).map(...)`), e o §4 mostra o `.bind` vazando `KindN` sob strict.
- O narrowing exige a disciplina do §2.5 (`isinstance`/`match`), com o gotcha do `.ok` à espreita.

**E o próprio Wlaschin diz para não usar ROP em tudo.** Em [Against Railway-Oriented Programming](https://fsharpforfunandprofit.com/posts/against-railway-oriented-programming/) ele lista quando **não** usar `Result` e prefere exceção — e a distinção é a mesma que o LUC precisa:

> "Domain Errors [...] are errors that are to be expected as part of the business process" — e aí vale `Result`. Por contraste, "Panics [...] leave the system in an unknown state" — e aí "raise an exception."

Casos em que ele desaconselha `Result`: quando diagnóstico/stack trace importa (exceção carrega, `Result` não); fail-fast; erros de I/O (não modele toda falha de rede como `Result` — deixe virar exceção); performance; e quando o chamador não distingue o tipo de erro (use `option`/`None`, não `Result`). Ou seja: **o autor do pattern recomenda o híbrido** — `Result` só para erro de domínio esperado; exceção para infra/panic; `None` para ausência sem porquê.

**Aplicando ao LUC:** é literalmente o desenho do `apps/api`. `Result` (`Valid`/`Invalid`) aparece **só** na validação de formulário — onde a falha é (a) esperada, (b) plural (lista de `FieldError`), (c) precisa carregar dado estruturado (campo + copy pt-BR) até a borda. Todo o resto é exceção semântica (§5) ou `None` (§2.2). A "railway" completa (encadear muitos use-cases via `bind`) **não** foi importada — e, pela própria fonte, não deveria, já que a tradução paga imposto de ergonomia e de typing sem o retorno que F# tem de graça.

---

## 4. `returns` (dry-python) sob pyright strict — custo/benefício real

[`returns`](https://github.com/dry-python/returns) é a lib madura de containers funcionais em Python (`Result`, `Maybe`, `IO`, HKT emulados). Ela é "Fully typed [...] checked with `mypy`, PEP561 compatible" e "Adds emulated Higher Kinded Types support" ([README](https://raw.githubusercontent.com/dry-python/returns/master/README.md)). O detalhe que decide o custo para o LUC: a inferência plena depende do **plugin de mypy** dela (`plugins = returns.contrib.mypy.returns_plugin` na config de mypy) — e o LUC roda **pyright**, que **não** carrega esse plugin. Então a medição relevante é: o que resta do valor de `returns` sob pyright strict, sem o plugin?

Experimento (ambiente isolado: `returns` 0.28.0 + pyright 1.1.411, Python 3.14):

```python
from returns.result import Failure, Result, Success, safe

def divide(a: int, b: int) -> Result[int, str]:
    if b == 0:
        return Failure("division by zero")
    return Success(a // b)

def consume() -> None:
    r = divide(10, 2)
    reveal_type(r)                                        # Result[int, str]?
    chained = r.map(lambda v: v + 1).bind(lambda v: divide(v, 0))
    reveal_type(chained)
    reveal_type(r.value_or(0))
    match r:
        case Success(v): reveal_type(v)
        case Failure(e): reveal_type(e)

@safe
def parse(s: str) -> int:
    return int(s)
```

Output (podado):

```
returns_exp.py:16:17 - information: Type of "r" is "Result[int, str]"
returns_exp.py:19:15 - error: Type of "bind" is partially unknown
  Type of "bind" is "(function: (int) -> KindN[Result[Unknown, Unknown], _NewValueType@bind, str, Any]) -> Result[_NewValueType@bind, str]" (reportUnknownMemberType)
returns_exp.py:20:17 - information: Type of "chained" is "Result[int, str]"
returns_exp.py:23:17 - information: Type of "r.value_or(0)" is "int"
returns_exp.py:26:11 - error: Cases within match statement do not exhaustively handle all values
  Unhandled type: "Result[int, str]"  (reportMatchNotExhaustive)
returns_exp.py:28:25 - information: Type of "v" is "int"
returns_exp.py:30:25 - information: Type of "e" is "str"
returns_exp.py:39:17 - information: Type of "parse" is "(s: str) -> Result[int, Exception]"
returns_exp.py:40:17 - information: Type of "parse("3")" is "Result[int, Exception]"
2 errors, 0 warnings, 7 informations
```

**O que funciona sob pyright strict (sem plugin):**
- O tipo do container carrega o erro: `divide(...) -> Result[int, str]` — a falha é parte do tipo (a virtude central do result object).
- `r.value_or(0)` infere `int` — desembrulho seguro tipado.
- `match Success(v) / Failure(e)` **narrowa os valores** (`v: int`, `e: str`).
- `@safe` **retipa a assinatura**: `parse` vira `(s: str) -> Result[int, Exception]` — o decorator captura a exceção e a move para o tipo de retorno. Bom.

**O que custa sob pyright strict (o imposto):**
- `.bind(...)` **dispara `reportUnknownMemberType`**: o tipo do método vaza a emulação de HKT — `KindN[Result[Unknown, Unknown], ...]`. Sob strict, `Unknown` é erro. Ou seja, o encadeamento railway — o ponto inteiro da lib — é justamente o que trinca no strict. (`.map` sobrevive; `.bind` não.)
- `match Success/Failure` **dispara `reportMatchNotExhaustive`**: o pyright não sabe que `Result` é selado em `{Success, Failure}`, então exige `case _`. Sem o plugin, o `match` nunca é exaustivo aos olhos do checker.

**Veredito para o LUC:** não compensa hoje. `returns` foi desenhada para brilhar sob **mypy + plugin**; sob pyright strict ela entrega o `Result[V,E]` tipado e o `@safe`, mas o encadeamento (`bind`) e a exaustividade — as duas razões para trazer a lib em vez de uma dataclass de 12 linhas — degradam para `reportUnknownMemberType`/`reportMatchNotExhaustive`, que a régua strict do repo trataria como erro. A dataclass `Valid`/`Invalid` do repo (12 linhas, zero deps, narrowing limpo por `isinstance`) domina no custo/benefício. `returns` só entraria se o repo migrasse a régua de tipo para mypy-com-plugin — o que contraria a decisão pinada (pyright strict, ADR-0014/0016).

---

## 5. A borda HTTP — RFC 9457 problem+json, e o que o `apps/api` já emite

A [RFC 9457 "Problem Details for HTTP APIs"](https://www.rfc-editor.org/rfc/rfc9457.html) (que **obsoleta a RFC 7807**) padroniza o corpo de erro. Media type: **`application/problem+json`** (§3). Membros padrão de um problem detail object (§3.1):

- `type` — "a JSON string containing a URI reference that identifies the problem type"
- `status` — "a JSON number indicating the HTTP status code generated by the origin server"
- `title` — "a JSON string containing a short, human-readable summary of the problem type"
- `detail` — "a JSON string containing a human-readable explanation specific to this occurrence"
- `instance` — "a JSON string containing a URI reference that identifies the specific occurrence"

E o mecanismo de extensão (§3.2), que é onde o LUC pendura dado estruturado:

> "Problem type definitions MAY extend the problem details object with additional members [...] Clients consuming problem details MUST ignore any such extensions that they don't recognize; this allows problem types to evolve and include additional information in the future."

**O `apps/api` já implementa isso — e é a peça que fecha o modelo de erro.** Toda a §1–§4 vive no núcleo (exceção semântica, `Valid`/`Invalid`, `None`); a §5 é a **borda** onde o número HTTP nasce (ADR-0003) e o erro semântico vira problem+json. Em `apps/api/src/luc_api/http/problems.py`:

- Media type declarado: `PROBLEM_MEDIA_TYPE = "application/problem+json"` (`problems.py:34`) — conforme RFC 9457 §3.
- A **tabela categoria→status**, único lugar que mapeia semântica para HTTP (`problems.py:38-43`): `NotFoundError→404`, `ConflictError→409`, `ValidationError→422`, `InvalidInputError→400`. Cada entrada produz `type`, `title`, `status`, `detail` (`_body`, `problems.py:53-59`).
- O tradutor de domínio caminha o **MRO** da exceção para achar a categoria (`_domain_error_to_problem`, `problems.py:71-85`) — captura a raiz `DomainError` e resolve a folha; **categoria não mapeada = bug de mapeamento → 500** logado sem vazar interno (`problems.py:76-85`). É o §1.2 na prática: hierarquia de exceção capturada por categoria na borda.
- A **extensão `errors`** (RFC 9457 §3.2) carrega o payload estruturado, nunca achatado em `detail`: nos erros de validação de request (`body["errors"] = jsonable_encoder(exc.errors())`, `problems.py:104`) e em `HTTPException` com `detail` não-textual (`problems.py:123`). O docstring do módulo (`problems.py:1-8`) é explícito: "Structured payloads [...] travel in the `errors` extension member, never flattened into `detail`."
- Autenticação: `AuthenticationError` (`apps/api/src/luc_api/http/identity.py:23`), levantada quando o token interno é ausente/expirado/forjado, é traduzida para **401** com header `WWW-Authenticate: Bearer` (`problems.py:88-92`) — o use-case nunca vê HTTP (ADR-0014).

**Fecho do ciclo:** o núcleo levanta `Valid`/`Invalid` na validação; a camada de aplicação converte `Invalid` numa exceção (`raise InvalidBillError(res.errors)` etc., §2.4); a exceção sobe até a borda; a borda a mapeia para problem+json e pendura os `FieldError` no membro `errors`. É a tradução _result-object → exceção semântica → problem+json_ ponta a ponta — cada forma no lugar onde é forte.

**Observação factual (não é um bug de comportamento):** o docstring de `problems.py:1-6` cita "RFC 7807". A RFC 7807 foi **obsoletada pela 9457**; o media type (`application/problem+json`) e a semântica de extension members são idênticos, então **a implementação é conformante à 9457** — só a referência textual nomeia o predecessor. Registro aqui porque a fonte primária corrente é a 9457; qualquer atualização de citação é cosmética e fora do escopo deste research (que não altera código).

---

## 6. Síntese para o `apps/api`

O LUC já convergiu para o desenho que a doutrina da linguagem, o typing sob pyright strict e o próprio autor do railway-oriented programming recomendam — vale deixar explícito para que futuras Áreas o repitam:

1. **Exceção semântica é o modelo primário de erro.** Hierarquia sob `Exception` (`DomainError` + categorias), levantada no núcleo, capturada **uma vez** na borda HTTP e traduzida para `application/problem+json`. Alinhado a EAFP (§1.1), à disciplina de `Exception`-não-`BaseException` (§1.2) e à borda-fina do ADR-0003. Custo aceito: o contrato de erro vive no docstring `Raises:`, não no tipo (§2.1).
2. **`None` é o sinal de ausência.** Lookups (`X | None`) e parse que pode não casar. Narrowing trivial por `is not None` (§2.2). Não use `None` quando o porquê importa e é plural.
3. **Result object (`Valid`/`Invalid`) é a exceção-à-regra, só para validação.** Falha esperada + plural + com dado estruturado a carregar. Tag **`Literal`** (não `bool`), consumido por **`isinstance`/`match`** (nunca `if .ok:` — o gotcha do §2.4), convertido em exceção semântica na fronteira da aplicação. É o híbrido que Wlaschin endossa (§3).
4. **Não traga `returns`.** Sob pyright strict, sem o plugin de mypy, `.bind` e a exaustividade de `match` degradam para erros de strict (§4); a dataclass de 12 linhas do repo domina.
5. **Exception groups: reserva estratégica.** Só quando um fan-out concorrente precisar reportar N falhas de uma vez (§1.3). Hoje, sobre-engenharia.

Regra de bolso para escolher a forma, na ordem: **ausência sem porquê → `None`; falha esperada, plural e estruturada (validação) → result discriminado consumido por `isinstance`; todo o resto (invariante violada, infra, panic) → exceção semântica**, com o número HTTP nascendo só na borda.

---

## Fontes

Primárias:
- Python — Glossário (EAFP, LBYL, race condition): https://docs.python.org/3/glossary.html
- Python — Built-in Exceptions (BaseException × Exception; ExceptionGroup/BaseExceptionGroup; subgroup/split): https://docs.python.org/3/library/exceptions.html
- PEP 654 — Exception Groups and `except*`: https://peps.python.org/pep-0654/
- PEP 647 — User-Defined Type Guards (`TypeGuard`): https://peps.python.org/pep-0647/
- PEP 742 — Narrowing types with `TypeIs`: https://peps.python.org/pep-0742/
- RFC 9457 — Problem Details for HTTP APIs (obsoleta a RFC 7807): https://www.rfc-editor.org/rfc/rfc9457.html
- Scott Wlaschin — Railway Oriented Programming (origem F#, 2014): https://fsharpforfunandprofit.com/rop/
- Scott Wlaschin — Against Railway Oriented Programming (caveats do próprio autor): https://fsharpforfunandprofit.com/posts/against-railway-oriented-programming/
- dry-python `returns` — repositório e README (typing, plugin de mypy, HKT emulado): https://github.com/dry-python/returns ; https://returns.readthedocs.io/en/latest/pages/result.html

Secundárias **(opinião)**:
- Real Python — LBYL vs EAFP: https://realpython.com/python-lbyl-vs-eafp/
- Microsoft for Python — Idiomatic Python: EAFP versus LBYL: https://devblogs.microsoft.com/python/idiomatic-python-eafp-versus-lbyl/
- pyright — Type Concepts (discriminated unions / narrowing): https://microsoft.github.io/pyright/#/type-concepts-advanced

Código do repo citado (todos em `apps/api/src/luc_api/`):
- `shared/domain/errors.py:17-34` — hierarquia `DomainError`
- `http/problems.py` — borda problem+json (media type `:34`; tabela categoria→status `:38-43`; MRO/unmapped→500 `:71-85`; extensão `errors` `:104` e `:123`)
- `http/identity.py:23` — `AuthenticationError` → 401
- `finance/domain/validation.py:13-34` — união discriminada `Valid`/`Invalid`
- consumidores por `isinstance`: `finance/application/{create_bill.py:29, record_payment.py:34, edit_bill.py:36, edit_payment.py:35, prepare_attachment_upload.py:46, import_backfill.py:145}`
- `None` como sinal: `identity/adapters/user_repo.py:31`, `finance/application/attachment_repo.py:44`, `whatsapp/adapters/payment_proposal_repo.py:76`, `whatsapp/application/respond_to_proposal.py:692`
