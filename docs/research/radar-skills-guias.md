# Radar de skills.sh e guias de terceiros — o que o mercado prega pros eixos do padrão Python

> Research do mapa wayfinder #219 (ticket #225). Radar do que o mercado de *skills* de agente e de guias de terceiros prega pros eixos do padrão de backend Python — capturando o **argumento** de cada posição, não a autoridade.

## Como ler este documento (método)

**Tudo aqui é rótulo `opinião`.** Nenhuma posição decide nada sozinha; o valor está no *argumento* (o porquê, o cenário concreto que a justifica), não em quem a defende. As únicas fontes tratadas como não-opinião são as **fontes primárias** (PEPs, spec de typing, docs oficiais de Python/FastAPI/SQLAlchemy/Pydantic), usadas exclusivamente para **flagar conflito** quando uma opinião as contradiz ou as extrapola. Onde N fontes independentes pregam a mesma coisa, isso vira uma **convergência** anotada com o argumento compartilhado; onde discordam, uma **divergência**. Onde uma posição toca uma decisão já firmada do LUC (ADR-0003/0005/0015/0016, CONTEXT.md), há um **eco no LUC** factual — não uma recomendação.

Vigilância anti-cerimônia (do método do mapa): quase todo espécime maximalista carrega, ele mesmo, uma cláusula de "pule isto se…". Essas cláusulas são posição de primeira classe e estão consolidadas na seção "Leitura anti-cerimônia".

## 1. O radar — fontes e proveniência

Achado meta que atravessa tudo: **as skills de terceiros que já foram instaladas neste repo (`.agents/skills/`) são, elas mesmas, artefatos publicados no skills.sh.** O `clean-ddd-hexagonal` é `ccheney/robust-skills`; `python-code-style`/`python-project-structure`/`python-testing-patterns` são de `wshobson/agents` (repo de ~38k estrelas); `hexagonal-architecture` é `affaan-m/everything-claude-code` (metadata `origin: ECC`). Ou seja, os espécimes locais **são** o mercado, e o radar do skills.sh confirmou-os na fonte e trouxe vizinhos novos (`architecture-patterns`, `tdd`, `fastapi-python`, `python-architecture-review`).

Fontes efetivamente lidas (fidelidade na seção 8):

| Bloco | Fontes | Natureza |
|---|---|---|
| **skills.sh** (radar principal) | `clean-ddd-hexagonal` (ccheney), `architecture-patterns` (wshobson), `hexagonal-architecture` (affaan-m/ECC), `python-code-style` (wshobson), `python-project-structure` (wshobson), `python-testing-patterns` (wshobson), `tdd` (linhagem Matt Pocock/superpowers), `fastapi-python` (mindrally), `python-architecture-review` (rknall) | skills de agente, opinião |
| **Cosmic Python** | *Architecture Patterns with Python*, Percival & Gregory (livro grátis, 16 capítulos lidos) | guia/livro, opinião |
| **Esfera ArjanCodes** | ArjanCodes (blog + vídeo), jellis18, Adam Johnson, Tin Tvrtkovic (attrs), Coderik, szymon miks, Brandon Rhodes (python-patterns.guide) | artigos de opinião |
| **FastAPI produção** | `zhanymkanov/fastapi-best-practices`, Netflix **Dispatch** (app real), docs oficiais FastAPI, `awesome-fastapi` | best-practices, opinião + doc oficial |
| **Fontes primárias (âncoras)** | PEP 8, PEP 544, PEP 557, docs `decimal`, docs FastAPI, docs SQLAlchemy 2.0 | não-opinião; só pra flagar conflito |

Uma nota de acesso: o skills.sh é um diretório navegável (927k+ skills indexadas), mas as páginas de detalhe truncam o corpo do `SKILL.md`; o texto verbatim dos argumentos veio dos repositórios GitHub que ele indexa e das cópias fiéis vendorizadas no HEAD deste repo. Não há página de tópico "Python"/"backend"/"architecture" no skills.sh — só se acha por busca (os tópicos de primeira classe são React, Next.js, Design, Mobile, Databases, Testing, Agent-workflows, Marketing).

## 2. Síntese por eixo

### 2.1 Contratos / ports

**Posições e argumentos.** Todo o eixo de arquitetura converge em "port = a interface que o núcleo possui; adapter = a implementação na borda". O ponto argumentado, e onde as opiniões se afinam, é **como um port existe em Python**:

- Cosmic Python (opinião): "Python não tem interfaces *per se*; se você usa uma ABC, *essa* é o port; se não, o port é só o duck type ao qual seus adapters se conformam". Isto é, o port pode ser **explícito (ABC/Protocol) ou implícito (duck type)** — a formalização é opcional, o contrato não. Argumento de design load-bearing: "construir *fakes* pra suas abstrações é uma excelente forma de obter feedback de design — se é difícil de fingir, a abstração provavelmente está complicada demais".
- `hexagonal-architecture` (affaan-m) e a skill homônima ECC (opinião): "ports modelam **capacidades, não tecnologias**" e "defina os outbound ports **primeiro**" (todo efeito colateral vira port antes de implementar). Reforça "strong vs weak hexagonal": um port que vaza `findByQuery(sql)` é fraco; o forte só fala conceito de domínio. Argumento: trocar tecnologia sem tocar o núcleo.
- `architecture-patterns` (wshobson, Python-native): o construtor do use-case "deve aceitar o **port abstrato, não a classe concreta**"; sintoma de vazamento: "se o teste do use-case exige um banco rodando, a lógica de negócio vazou pra camada de infraestrutura".
- `clean-ddd-hexagonal` (ccheney): repository é port **por agregado, não por tabela/entidade** ("repository per entity quebra as fronteiras do agregado"); Clock e UUID também são ports ("mantém o domínio determinístico e testável").

**Convergência (≥4 fontes).** Núcleo depende de abstração; toda dependência externa é um port; Clock/relógio é port. Argumento compartilhado: testabilidade sem infra + independência de framework (litmus de Cockburn citado literalmente por clean-ddd: "crie sua aplicação pra funcionar sem UI e sem banco").

**Divergência.** Formalização do port: ABC explícita (clean-ddd, architecture-patterns) × duck type aceitável (Cosmic, e Rhodes na esfera ArjanCodes) × Protocol estrutural (recomendado por jellis18/Adam Johnson e citado pela própria Cosmic — ver 2.13).

**Eco no LUC.** Converge com ADR-0003 (núcleo isolado, ports em `application/`) e com o Clock/FixedClock firmado no ADR-0015. A "capacidade, não tecnologia" e "outbound port primeiro" batem com a prática já registrada do `apps/api`.

### 2.2 ISP (segregação de interface)

**Posições e argumentos.** ISP quase nunca aparece nominalmente — aparece obliquamente, e a leitura anti-cerimônia é o achado:

- `hexagonal-architecture` (ECC): "toda skill assume que cada port é uma interface separada — **não assuma isso**" (CHEATSHEET). E o hedge explícito no HEXAGONAL.md: "ports explícitos valem quando múltiplos adapters, *seams* de teste ou fronteiras de time os justificam; **em bases pequenas, um método público do handler já basta como driver port**". No idioma Go: "interfaces pequenas, **de posse do pacote consumidor**".
- `tdd` (Matt Pocock): "prefira interfaces estilo-SDK a *fetchers* genéricos" — uma função por operação. Argumento concreto e testável: "cada mock devolve uma forma específica; sem lógica condicional no setup do teste; dá pra ver quais endpoints um teste exercita; type-safety por endpoint".
- Cosmic Python: a UoW "estreita deliberadamente a interface entre o ORM e nosso código"; a Session do SQLAlchemy "expõe funcionalidade demais — queremos que cada componente tenha exatamente o que precisa e nada mais". Isto *é* ISP, argumentado via "don't mock what you don't own" (ver 2.4).
- jellis18/Adam Johnson (esfera ArjanCodes): Protocol permite "definir múltiplos protocolos pro mesmo objeto conforme o que é necessário" — ISP por construção, consumidor define a fatia mínima.

**Convergência.** Interface mínima e de posse do consumidor. Argumento compartilhado: superfície menor = menos setup de teste, menos acoplamento, menos a fingir.

**Divergência.** Quando materializar em interface nomeada: os hexagonais dizem "só quando ≥2 adapters/seams justificam"; a linha SDK-style (tdd) já quer uma função por operação desde cedo.

**Eco no LUC.** O hedge "handler público basta como port em base pequena" é exatamente o espírito anti-cerimônia do mapa (posições argumentadas, não superconjunto de patterns).

### 2.3 Contract tests (testes de contrato de port)

**Posições e argumentos.**

- `hexagonal-architecture` (ECC) é a **única** fonte que prescreve contract tests nominalmente: "outbound adapter contract tests — defina *suítes de contrato compartilhadas no nível do port* e rode-as contra **cada** implementação de adapter". Argumento: o mesmo contrato deve valer para o fake in-memory e para o adapter real.
- Cosmic Python chega ao mesmo lugar sem o nome, via a receita "construa um adapter direito": **ABC → implemente o real → construa um fake pro teste unitário → ache uma versão 'menos fake' (Docker) → teste de integração contra a 'menos fake'**. É a disciplina de contrato equivalente (fake + adapter real verificados contra a mesma abstração).
- `clean-ddd-hexagonal` (ccheney) **não** prescreve contract suite de port; prescreve, no lugar, **architecture/dependency tests** (import-linter em Python; tsarch/ArchUnit) que enforçam a regra de dependência no CI — "pra que a regra sobreviva a refactors e novos contribuidores". São coisas diferentes: contrato-de-port × contrato-de-camada.

**Divergência (relevante).** Contract suite por port (ECC + Cosmic implícito) × teste de arquitetura/dependência (clean-ddd) × silêncio (todo o resto). Não é o mesmo teste: um garante que todo adapter honra o port; o outro garante que ninguém importa pra dentro errado.

**Eco no LUC.** O import-linter da régua do `apps/api` é o "architecture test" da clean-ddd, não o contract-test-de-port da ECC/Cosmic — que hoje não existe no repo. Distinção que o mapa pode querer indexar.

### 2.4 Fakes × mocks

**Posições e argumentos.** É o eixo mais bem-argumentado do radar inteiro, e há um campeão nítido:

- Cosmic Python (opinião forte, classicista/Detroit, não London): **prefira fakes, evite mocks e monkeypatch.** Três razões literais: (1) "dar patch na dependência não melhora em nada o design — `mock.patch` não faz seu código ganhar um `--dry-run`"; (2) "testes com mock tendem a acoplar-se a detalhes de implementação… verificam interações (chamamos `shutil.copy` com os args certos?) — isso os deixa quebradiços"; (3) "excesso de mocks leva a suítes complicadas que falham em explicar o código". Frase-síntese: "nosso instinto é que frameworks de mock, particularmente monkeypatch, são um *code smell*". E o "**don't mock what you don't own**": mockar a Session do SQLAlchemy é "escolher acoplar-se a toda a complexidade do SQLAlchemy" — a regra "nos força a construir abstrações simples sobre subsistemas confusos". Custo que concede: DI explícito é "*test-induced design damage*" (citando DHH) e os fakes têm custo de manutenção — julgado baixo depois que a interface estabiliza.
- `tdd` (Matt Pocock): "mocke **só nas fronteiras do sistema** (APIs externas, DB às vezes — prefira DB de teste, tempo/aleatoriedade). **Não mocke suas próprias classes / colaboradores internos / nada que você controla**." Argumento: mockar interno acopla teste à implementação.
- `architecture-patterns` (wshobson): `InMemoryUserRepository(IUserRepository)` escrito à mão em teste unitário puro — "o **selo** da Clean Architecture bem aplicada é que todo use-case roda em teste unitário simples, sem banco real, sem Docker, sem rede". Chama corretamente de "in-memory", não de mock.
- `hexagonal-architecture` (ECC): "teste unitário de use-case com **fakes/stubs** dos outbound ports"; domínio "sem mocks, sem setup de framework". Usa a palavra *fake* corretamente.
- **Contra-corrente:** `python-testing-patterns` (wshobson) usa `unittest.mock.Mock` livremente — `side_effect` pra retry, `patch("requests.get")`, `assert_called_once_with` — e endossa **mocking de interação sem argumento**. Diverge frontalmente do consenso acima.

**Convergência (≥5 fontes).** Fake in-memory pro port em teste de use-case; nada de mockar o que você possui; domínio puro sem mock. Argumento compartilhado: se o teste do use-case precisa de DB, a lógica vazou pra infra; mock de interno = teste acoplado a implementação, quebra no refactor.

**Divergência.** O consenso pró-fake × `python-testing-patterns` pró-`Mock`/interação. E uma **armadilha de terminologia**: o `clean-ddd-hexagonal` nomeia seus dobros de teste `MockOrderRepository`/`MockEventPublisher`, mas eles são **fakes** (implementação in-memory com estado). Pela taxonomia canônica (Fowler, *Mocks Aren't Stubs*; Meszaros, *xUnit Test Patterns*), uma implementação in-memory funcional é **Fake**, não Mock — então "mocke nos port boundaries" nessa skill quer dizer "injete um fake". Cosmic Python inclusive nota (via taxonomia de Fowler) que os objetos de `unittest.mock` "não são, a rigor, mocks; são *spies*" — auto-rotulado como preciosismo, não erro.

**Eco no LUC.** Converge fortemente com "use-case com fakes dos ports (sem DB)" do ADR-0003/convenções. E o `python-testing-patterns` pró-freezegun/`Mock` é o exato oposto do firmado no ADR-0015 ("Clock/FixedClock… nunca freezegun") — ver 2.11.

### 2.5 DI (injeção de dependência)

**Posições e argumentos.**

- Cosmic Python: **dependências explícitas + DI manual num único `bootstrap.py` (composition root)**. Framework de DI só pra "DI encadeada / multi-nível". Argumento: import implícito + `mock.patch` acopla ao estilo de import ("se um dia eu quiser `from email import send_mail`, um refactor trivial, teria de mudar todos os mocks"); DI explícito é DIP em ação e invoca o Zen ("explícito é melhor que implícito"). Autocrítica candid: o próprio Bob acusou o Harry de "*overengineering* e escrever seu próprio framework de DI" — eles oferecem uma variante "DI ainda mais manual, com menos mágica". Config vive num `config.py`.
- ArjanCodes (blog, lido): **injeção manual por construtor/parâmetro**, nunca hardcode `self.db = Database()`. Argumento tríplice: desacoplamento ("desacoplar a criação dos objetos dependentes da classe que os usa nos dá design mais modular e coeso"), testabilidade ("trocar dependências reais por mocks/stubs") e flexibilidade ("dependências facilmente substituíveis"). Nota: o post dele **não toma posição sobre containers** — nem endossa nem condena; a preferência "passar em vez de framework" é inferível, não argumentada por ele.
- `hexagonal-architecture` (ECC): composition root centralizado, **sem containers/service-locator** — "centralize o *wiring* pra evitar comportamento oculto de service-locator" e "evite singletons globais escondidos".
- `clean-ddd-hexagonal` (ccheney): composition root, injeção por construtor — mas o exemplo do LAYERS.md usa um **container `inversify`** (framework de DI).
- FastAPI (zhanymkanov, Dispatch, docs): o sistema `Depends` do próprio framework; dependências como camada de validação (ver 2.6/2.11). Minoria (awesome-fastapi): containers IoC de verdade (`modern-di`, `Wireup`) "pra compartilhar dependências entre web, cli e outras interfaces" — argumento de multi-entrypoint.

**Convergência (≥4 fontes).** Injeção por construtor num composition root único; dependência explícita = testável e trocável. Argumento compartilhado: DIP + a boilerplate de mock some quando a dependência é passada, não importada.

**Divergência (nítida).** Mecanismo de wiring: **container** (clean-ddd usa inversify; minoria FastAPI usa modern-di/Wireup) × **manual com aviso explícito contra containers** (ECC: "evite service-locator oculto") × **chamada de construtor pura / `Depends` do framework** (architecture-patterns, FastAPI). Cosmic fica no meio: manual por padrão, framework só pra DI encadeada.

**Eco no LUC.** "Composition root manual" é o que a memória do #197 registra pro `apps/api` — converge com Cosmic/ECC e **diverge** do exemplo com inversify da clean-ddd.

### 2.6 Forma do use-case

**Posições e argumentos.** Divisão real entre **função** e **classe-handler**:

- Cosmic Python: **funções simples.** O service layer é um `services.py` cheio de funções; os "verbos" do domínio também são funções. Um service típico tem 4 passos: busca objetos no repo, valida contra o estado atual, chama um domain service, commita. Classes-handler aparecem só como *alternativa* no cap. de DI ("use o que você e seu time preferirem"). Cenário: "as views do Flask ficam bem finas — sua única responsabilidade é 'coisa de web'". Cuidado explícito: "lógica demais no service layer leva ao antipadrão Domínio Anêmico — melhor introduzir essa camada depois de ver orquestração vazando pros controllers".
- `clean-ddd-hexagonal`, `architecture-patterns`, `hexagonal-architecture`: **classe Handler/UseCase** com ports no construtor e `execute(command)`/`handle(command)`. clean-ddd: "handlers leem como um script — carrega agregado → chama um método de comportamento → salva → publica"; use-case = fronteira de transação (UoW begin/commit/rollback no handler). architecture-patterns: `execute(request)` devolve um **objeto Response com `.success`/`.error`** (padrão Result, não exceção). ECC: `execute(input)` "devolve estruturas de dados simples", transformações imutáveis (devolve nova entidade, não muta).
- `fastapi-python` (mindrally): "**favoreça funcional/declarativo a class-based**", RORO (Receive-Object-Return-Object) — posição oposta às classes-handler, e **sem argumento** (é um prompt de estilo repackaged).
- FastAPI produção (zhanymkanov/Dispatch): `service.py` por domínio com funções; Dispatch acrescenta `flows.py` pra orquestração cross-entidade; "SQL-first, Pydantic-second" (deixa o banco fazer o processamento pesado).

**Divergência (a mais direta do radar).** Função (Cosmic, fastapi-python, FastAPI-prod) × classe-handler injetável (clean-ddd, architecture-patterns, ECC). Ambos com o mesmo objetivo (borda fina, um caminho por use-case), mecânica oposta.

**Sub-divergência de retorno.** Exceção lançada e mapeada no controller (clean-ddd) × Result/Response com `.success/.error` (architecture-patterns) — ver 2.9.

**Eco no LUC.** ADR-0003 firma "use-cases puros que dependem de ports"; a *forma* (função × classe) não está cravada — é exatamente o tipo de eixo que o mapa existe pra adjudicar. O radar entrega os dois campos argumentados.

### 2.7 Topologia (vertical slice × camadas)

**Posições e argumentos.** Dois campos, e um consenso de mecânica por baixo:

- **Camadas (layer-first):** `clean-ddd-hexagonal` (default: `domain/application/infrastructure` + `presentation/` opcional, 3-vs-4 camadas), Cosmic Python (`domain/`, `service_layer/`, `adapters/` = driven, `entrypoints/` = driving; "ports no mesmo arquivo dos adapters que os implementam"), `python-project-structure` (oferece o layout `api/services/repositories/models/schemas`). Argumento: regra de dependência pra dentro, domínio no centro (Cosmic trata onion = hexagonal = ports-and-adapters = clean como sinônimos, "tudo se reduz ao DIP").
- **Fatia vertical (feature-first):** `hexagonal-architecture` (ECC) explícito — `features/orders/{domain, application/ports/{inbound,outbound}, adapters/{inbound,outbound}, composition}`; `fastapi-best-practices` (zhanymkanov) e **Netflix Dispatch** (app de produção real, ~50 módulos de domínio: `incident/`, `case/`, `participant/`…) — cada domínio possui seu `router/views.py`, `schemas/models.py`, `service.py`, `dependencies.py`, `exceptions.py`, `config.py`, `constants.py`. Argumento (zhanymkanov, literal): "organizar por *tipo de arquivo* (crud/routers/models) funciona pra microserviço/projeto pequeno, mas **não escalou** pro nosso monólito com muitos domínios"; coesão + times trabalham por módulo + "sem surpresas".
- `clean-ddd-hexagonal` é híbrido: camadas no topo, mas **pastas por use-case** dentro de `application/` (`command`/`handler`/`port`) — fatia vertical dentro das camadas.

**Convergência de mecânica.** Mesmo os dois campos concordam no *mecanismo* FastAPI: `APIRouter` + `include_router` + dependências no nível do router. O desacordo é só de **agrupamento de pastas** (por domínio × por tipo).

**Conflito com fonte primária (layout).** O tutorial oficial do FastAPI ("Bigger Applications") mostra layout **por tipo** (`routers/`, `dependencies.py`, `internal/`). O campo domínio-vertical (zhanymkanov + Dispatch) **contradiz** esse exemplo de propósito — mas **alinha** com a mecânica `APIRouter`/`include_router` que a doc oficial define. É contradição de exemplo, não de API.

**Divergência intra-campo.** Até os dois vertical-slice discordam de nomes: `router.py` + `schemas.py` separado (zhanymkanov) × `views.py` + schemas dobrados dentro de `models.py` (Dispatch).

**Eco no LUC.** ADR-0015 firma "estrutura Python por conceito de domínio, nunca por tipo DDD; subpacote só quando um Assunto/agregado coeso emergir; módulos por papel (`errors.py`, `events.py`) ok". Isso é **fatia-por-conceito** — converge com o campo vertical (Dispatch/ECC/zhanymkanov) e **rejeita** o `value_objects.ts`/`entities` da clean-ddd (ver 2.8).

### 2.8 DTOs / forma do domínio

**Posições e argumentos.**

- Cosmic Python: modele com Entity / Value Object / Domain Service em **Python nativo (`@dataclass`)**, "o mais livre possível de restrições externas". VO = "objeto de domínio unicamente identificado pelos dados que carrega, geralmente imutável" (dataclass/namedtuple dá igualdade por valor de graça; pode carregar comportamento, ex. aritmética de `Money` por *magic methods*). **Obsessão por primitivos — posição deliberadamente nuançada e móvel:** no cap. 5 eles *reduzem* a API do service layer a **primitivos** (`str`/`int`) "pra desacoplar o cliente do service da camada de modelo"; no cap. 9 movem a fronteira pra um **dataclass de evento/comando** como DTO de entrada, e rejeitam a regra dogmática: "no mundo OO fala-se de *primitive obsession* como antipadrão… no mundo Python muita gente seria cética disso como regra de bolso — aplicada sem pensar, é receita de complexidade desnecessária". O DTO deles é um **dataclass de comando/evento na borda**, adotado por ser entrada *nomeada, estável e validável* — não "embrulhe todo primitivo".
- FastAPI produção (zhanymkanov, Dispatch): **Pydantic em tudo na borda**; um **BaseModel customizado compartilhado** (`CustomModel`/`DispatchBase`) pra formato único de serialização (datetime UTC); família de schemas por recurso (`Base/Create/Update/Read/Pagination`). DTO (schemas) distinto de model (linha de DB). Argumento: um único ponto controlável pro comportamento global do modelo.
- Esfera ArjanCodes — "**Pydantic na borda, dataclass no núcleo**": Coderik (lido) "seu domínio deve ser puro e independente… quanto menos o núcleo depende de ferramentas específicas, mais fácil manter, testar e substituir"; prescrição: "Pydantic é ótimo, só não em todo lugar — idealmente vive nas camadas externas (infra pra APIs/DB, apresentação pra request/response do FastAPI)". Tin Tvrtkovic (mantenedor do attrs): validação/serialização devem ser separáveis, não embutidas no modelo — "tipos estáticos por dentro (mypy), parsing em runtime só na entrada (cattrs)"; attrs ~3x mais rápido na criação e ~4x na serialização que Pydantic. ArjanCodes: dataclasses são "principalmente sobre *agrupar* variáveis"; Pydantic é "controle de fronteira pra APIs Python" porque "a maioria dos defeitos entra nas bordas (HTTP, filas)".

**Convergência (≥3 fontes).** Validar na borda, domínio agnóstico de framework: Pydantic-na-borda / dataclass-no-núcleo. Argumento compartilhado: defeito entra na borda; valide lá e passe pra dentro um objeto confiável.

**Divergência (genuína, não resolvida).** **Pydantic no domínio** — pureza (Coderik, campo attrs) × pragmatismo (pushback no HN: pra app pequeno/solo a boilerplate de mapeamento não compensa; Pydantic-no-domínio "só passa a importar" em escala). E **attrs × Pydantic** como "a biblioteca séria de modelo": performance/separação (attrs) × baterias-inclusas (Pydantic).

**Conflito com fonte primária.**
- O **VO `Money` com float** da `clean-ddd-hexagonal` (`Money.create(10.50, 'USD')`, `Money.create(5.99, 'USD')`) contradiz a **doc oficial do `decimal`**: "`decimal` é preferível em aplicações de contabilidade, que têm invariantes estritas de igualdade" e "1.1 + 2.2 não tem representação exata em ponto flutuante binário". Ponto flutuante binário pra dinheiro é *footgun* documentado. (A própria skill é internamente inconsistente: o adapter Stripe usa `amount.cents` e o teste de API usa `price: 1000`, ou seja centavos, enquanto o VO cria com dólares float.)
- PEP 557: dataclasses foram escopadas *de propósito* como conveniência de geração de código **sem validação em runtime**. Logo o split "dataclass-no-domínio, Pydantic-pra-validação" **alinha** com o minimalismo intencional de dataclasses (Pydantic não é concorrente de dataclass, é ferramenta de outra camada).

**Eco no LUC.** Colisão dupla e nítida com o firmado: CONTEXT.md #6 e ADR-0015 mandam **inteiro em centavos, sem VO `Money`, nunca float** — o `Money` VO-float da clean-ddd é o contra-exemplo perfeito. E ADR-0015 usa `datetime.date`/`str "YYYY-MM"` nativos, dataclass frozen só pra conceito composto com comportamento — que é exatamente a linha "dataclass no núcleo, validação vira parse na borda" da esfera ArjanCodes e da Cosmic.

### 2.9 Erros

**Posições e argumentos.** Três escolas:

- **Exceções + hierarquia de domínio rasa** (mainstream): `clean-ddd-hexagonal` lança erros de domínio (`InsufficientStockError`) do domínio/app e o controller mapeia pra HTTP; Cosmic Python (cap. 1) "exceções podem expressar conceitos de domínio — `OutOfStock` na linguagem ubíqua, como fazemos com entidades e VOs". Esfera ArjanCodes converge: hierarquia de exceção custom vale "quando você cria uma interface ou biblioteca" (deixa o chamador pegar a geral e receber todas as descendentes), mas **rasa** — invoca o Zen ("plano é melhor que aninhado"; "PaymentError→CreditCardError→ExpiredCardError confunde"); herde de `Exception`, nome terminando em `Error`, junte em `exceptions.py`.
- **Result / errors-as-values**: `architecture-patterns` (wshobson) — `execute()` devolve Response com `.success`/`.error` (sem exceção). ArjanCodes (vídeo/monads, lido): "com error handling monádico não há fluxo de controle oculto como nas exceções — sucesso e falha são explícitos"; mais rico que `None`. Framing dele é *soft* ("uma ferramenta na caixa", não substituto).
- **Guard clauses / RORO**: `fastapi-python` — early return, happy-path por último, evitar `else` (sem argumento).
- **Tradução na fronteira** (transversal): ECC — "erros de infra → erros de aplicação/domínio" traduzidos no adapter.

Cosmic tem uma **evolução** interessante: no cap. 8 eles *substituem* a exceção `OutOfStock` por um **evento de domínio**, alertando contra exceção-como-fluxo-de-controle ("se você implementa domain events, não levante exceção pra descrever o mesmo conceito de domínio"). E estratificam validação (Apêndice E): **sintaxe na borda** (forma da mensagem), **semântica no service layer** (pré-condições estilo contrato), **pragmática no domínio** (regra de negócio tipo "estoque insuficiente") — com a razão "dado inválido vagando pelo sistema é uma bomba-relógio; quanto mais fundo, mais estrago".

**Conflito com fonte primária.** O campo Result empurra Python pra LBYL/estilo-Go, **contra** o idioma documentado **EAFP** ("*easier to ask forgiveness than permission*"): a doc de Python trata EAFP como o estilo pythônico ("focar no caso normal e tratar exceções à parte deixa a lógica principal mais aparente"). Os posts pró-Result costumam **omitir** esse custo de idioma. Não é erro factual — é opinião que rema contra a corrente da linguagem.

**Divergência.** Exceção lançada (clean-ddd, Cosmic cap.1) × Result/Response (architecture-patterns, ArjanCodes-monads) × evento de domínio no lugar da exceção (Cosmic cap.8). Todos concordam em **traduzir infra→domínio na borda** e em **hierarquia rasa**.

**Eco no LUC.** ADR-0015 manda mensagem de exceção em inglês; o LUC usa exceções de domínio (memória: `errors.py` por conceito). A escolha exceção × Result não está cravada — outro eixo vivo que o radar entrega argumentado dos dois lados.

### 2.10 Config

**Posições e argumentos.**

- Convergência de ferramenta: **pydantic-settings `BaseSettings`** — FastAPI oficial, zhanymkanov, Dispatch, `python-architecture-review` (rknall: "abstração de config, nada hard-coded, Pydantic settings"). Argumento: env var é sempre `str`; BaseSettings dá tipagem/validação/default/`.env`.
- **Divergência de entrega (o conflito primário mais afiado do bloco FastAPI):** a **doc oficial** recomenda entregar settings **por dependência** — `Depends(get_settings)` com `@lru_cache` — "especialmente útil em teste, porque é muito fácil sobrescrever uma dependência com settings customizadas" (`app.dependency_overrides[get_settings]`) e "ler o arquivo do disco é custoso, faça uma vez só". Já zhanymkanov **e** Dispatch instanciam config como **global de módulo** (`settings = Config()`), sem *seam* de override. zhanymkanov ainda argumenta **dividir settings por domínio** ("um BaseSettings único pro app inteiro vira bagunça") em vez de um global.

**Conflito/tensão com fonte primária.** Global de módulo (comunidade) × `Depends(get_settings)`+`@lru_cache` (doc oficial, otimizado pra override em teste). A doc não proíbe global, mas a recomendação explícita dela é o padrão-dependência. Split-por-domínio é extensão sobre a doc, não conflito.

**Eco no LUC.** O `apps/api` tem composition root manual (não `Depends` do FastAPI pro núcleo); config como fato de ambiente. Nada cravado sobre split-por-domínio.

### 2.11 Testes

**Posições e argumentos.** (Fakes×mocks já em 2.4; contract tests em 2.3.)

- **Pirâmide + alto/baixo marcha** (Cosmic): com service layer, "escreva o **grosso dos testes contra o service layer**" (edge-to-edge, fakes na I/O, "cubra exaustivamente os edge cases"); "mantenha um **núcleo pequeno** de testes de domínio — não tenha medo de deletá-los se a funcionalidade for coberta no service layer"; "**um teste e2e por feature**". Metáfora load-bearing: "cada linha num teste é uma gota de cola segurando o sistema numa forma; quanto mais teste de baixo nível, mais difícil mudar". Testes na linguagem de domínio viram "documentação viva". "Alto marcha" = testar no service layer (trabalho de rotina); "baixo marcha" = descer pro domínio "ao começar um projeto novo ou num problema espinhoso" (feedback de design).
- **Edge-to-edge** (Cosmic + `tdd`): dirija o sistema *inteiro* pelo entrypoint real, mas **finja a I/O nas bordas** via DI. `tdd` (Matt Pocock): teste comportamento **por interfaces públicas**, estilo-especificação que "sobrevive a refactor"; sinal de alarme: "se renomear uma função interna quebra o teste, ele testava implementação"; processo **vertical** (um teste → uma impl, nunca "todos os testes depois toda a impl", que testam "comportamento imaginado, a forma das coisas").
- **AAA + nomes** (`python-testing-patterns`, e todos): `test_<unit>_<scenario>_<expected>`, um comportamento por teste, testar caminhos de erro (não só o feliz), parametrize com `pytest.param(id=…)`.
- **Testes de arquitetura** (clean-ddd): import-linter no CI (ver 2.3).
- FastAPI: `app.dependency_overrides` (não monkeypatch) como *seam* de teste — alinha com a doc oficial; client async desde o dia 0 (`httpx.AsyncClient`+`ASGITransport`, pytest-asyncio) "pra evitar quebra de event loop em teste de integração com DB".

**Conflito com fonte primária / com o consenso.** **freezegun × Clock-port.** `python-testing-patterns` prescreve `@freeze_time` (monkeypatch do relógio, sem argumento). `hexagonal-architecture`/`clean-ddd-hexagonal` listam **Clock como port injetável** ("mantém o domínio determinístico e testável"). São filosofias de controle de tempo diretamente opostas (dar patch × injetar). Não é conflito com PEP, é conflito de escolas — mas casa com o consenso pró-injeção (2.4/2.5).

**Convergência (≥4 fontes).** AAA; nome `test_<unidade>_<cenário>_<esperado>`; testar caminho de erro; testar comportamento por interface pública; dobros in-memory. 

**Eco no LUC.** Bate quase 1:1 com as convenções firmadas: AAA/GWT escopado, `test_<cenário>_<esperado>`, `tests/` espelha `src/`, um teste por caso, parametrize só em teste novo, Clock/FixedClock. O único espécime que rema contra (freezegun/`Mock` livre do `python-testing-patterns`) é o mesmo que o ADR-0015 já excluiu nominalmente.

### 2.12 Régua (tooling/linters/type-checkers)

**Posições e argumentos.**

- **ruff como ferramenta única** de lint+format (convergência quase universal): `python-code-style` ("substitui flake8, isort e black por uma ferramenta rápida — deixe a ferramenta resolver os debates de formatação, configure uma vez, enforce automaticamente"), zhanymkanov ("substitui black/autoflake/isort, 600+ regras"), esfera ArjanCodes ("Ruff e mypy substituem flake8 + dezenas de plugins + isort + Black + pyupgrade + pylint; 10–100x mais rápido"). O formatter do Ruff é **compatível com Black** por design — adotá-lo é consistente com o espírito do PEP 8 (que ele mesmo desdenha "consistência tola" e delega estilo ao projeto; autoformatter só encerra o *bikeshedding*).
- **Type-checker strict, sem vencedor único:** `python-code-style` "mypy `strict` (ou pyright, pra checagem mais rápida)"; a esfera nota mypy = default da comunidade / maior ecossistema de plugins, Pyright = melhor integração de editor (VS Code/Pylance), novatos em Rust (Pyrefly, `ty`) atrás de velocidade. Posição de padrão: Ruff pra feedback rápido de lint + um type-checker pra profundidade; mypy×pyright é preferência de editor/strictness, não divisão de correção.
- **import-linter pra fronteiras** (clean-ddd, e a régua do LUC): teste de dependência no CI.
- `python-architecture-review` (rknall) lista **Black *e* Ruff** juntos (redundante — Ruff já formata) e Bandit/Safety pra segurança.

**Conflito com fonte primária.** **line-length 120** do `python-code-style` (`ignore E501`) contra o **PEP 8**: o PEP fixa **79** ("*Limit all lines to a maximum of 79 characters*"), relaxável a **99** "por acordo de time, desde que comentários e docstrings fiquem em 72". 120 excede até o limite relaxado — a skill sobrescreve silenciosamente o número do PEP, com o argumento "displays modernos".

**Convergência.** ruff + type-checker strict + import-linter pra fronteiras. Esse *cluster* casa de perto com a régua já firmada do `apps/api` (ruff + pyright strict + import-linter + pytest).

**Eco no LUC.** Régua do LUC = ruff + pyright strict + import-linter — convergência direta com o consenso do radar. A divergência de 120 colunas é do espécime `python-code-style`; o LUC usa o default do ruff format (88).

### 2.13 Estilo

**Posições e argumentos.**

- **Funções sobre classes-cerimônia** (Cosmic + ArjanCodes): Cosmic "Python é multiparadigma; deixe os 'verbos' serem funções — pra todo `FooManager`/`BarBuilder`/`BazFactory` há um `manage_foo()`/`build_bar()` mais expressivo". ArjanCodes (vídeo "Stop Overusing Classes"): "se uma classe tem dois métodos e um é `__init__`, ela não precisa ser classe" — prefira função, `functools.partial` pra args fixos, `NamedTuple` antes de escrever classe.
- **Composição sobre herança** (Brandon Rhodes, python-patterns.guide — o write-up mais rigoroso): o argumento central é **explosão de subclasses** ("uma classe precisa se especializar em vários eixos ao mesmo tempo → explosão de subclasses pra cada combinação"; 2 saídas × 2 filtros = 4 classes, crescimento geométrico); solução = composição + DI + duck typing ("adapters não precisam herdar dos tipos que imitam — só ter assinaturas compatíveis"). Contra-voz (death.andgravity, Real Python): herança serve o "é-um" verdadeiro; composição "com componentes não-relacionados que precisam de flexibilidade — mas nem sempre é o caso, então você pode pegar as desvantagens sem os benefícios".
- **ABC × Protocol** (esfera ArjanCodes; e Cosmic): argumento pró-Protocol — sem acoplamento de herança/duck-typed ("a classe só precisa ter os mesmos métodos, sem subclassing"), funciona com classes de terceiros que você não pode modificar, ISP por construção; argumento pró-ABC — enforcement em runtime ("impede instanciar classe com método abstrato faltando" — erro na construção, não no uso), implementação compartilhada, hierarquia "é-um" explícita. Consenso balanceado: "**ABC pra hierarquia interna com código compartilhado + rede de segurança em runtime; Protocol pra contratos externos (ports)**; use os dois". Cosmic vai além: "às vezes deletamos ABCs do código de produção — Python torna fácil demais ignorá-las, e elas ficam não-mantidas e enganosas; na prática confiamos no duck typing", e aponta Protocol como "typing sem a possibilidade de herança, que os fãs de 'composição sobre herança' vão gostar".
- **Docstrings** (`python-code-style`): Google-style em toda API pública (Args/Returns/Raises/Example), "docs-as-code". Denso.
- **Naming na linguagem ubíqua** (Cosmic): entidades, VOs, serviços, exceções, eventos e nomes de teste na linguagem de domínio.

**Conflito/nuance com fonte primária.**
- **PEP 544** é o dono do Protocol. Ela **motiva** o campo pró-Protocol ("forçar classe-base explícita é anti-pythônico") **mas explicitamente NÃO substitui ABC**: "não propomos substituir o subtyping nominal — protocolos **complementam** classes normais". Logo qualquer opinião "Protocol torna ABC obsoleto" **extrapola** o PEP; o consenso "use os dois, pra jobs diferentes" é o que **alinha**. E o `@runtime_checkable` "checa **presença de método, não assinatura**", opt-in, "não 100% confiável estaticamente" — a afirmação popular "Protocol dá enforcement de interface como ABC" é mais fraca do que soa (jellis18 é dos poucos que flaga isso certo).
- **absolute imports "exclusivamente"** (`python-code-style`, `python-project-structure`) é **mais estrito que o PEP 8**, que diz "imports relativos explícitos são uma alternativa aceitável, especialmente em layouts de pacote complexos". Opinião mais dura que a spec.
- **`fastapi-python` (mindrally) — dois *tells* de baixa confiança:** "omita chaves em condicionais de uma linha" (Python não tem chaves — artefato de copy-paste de um prompt JS/TS) e "use async pra **todas** as chamadas de DB e API" (simplifica demais a própria doc do FastAPI, que manda `def` pra trabalho bloqueante/síncrono — pôr driver síncrono dentro de `async def` trava o event loop). Trate a skill como prompt genérico levemente adaptado.

**Convergência.** Funções sobre classes-cerimônia; composição + duck typing sobre herança profunda; hierarquia de exceção rasa. Argumento compartilhado: menos cerimônia, menos acoplamento por herança, mais testável.

**Eco no LUC.** ADR-0015 "sem base classes de DDD; estrutura por conceito; tipo nativo semântico quando existe" é exatamente a linha funções-sobre-cerimônia + composição-sobre-herança + "delete a ABC se não paga". ADR-0016 (inglês integral no código) não tem contraparte no radar — é convenção local, não posição de mercado.

## 3. Mapa de convergências (o que N fontes independentes pregam, e por quê)

| Convergência | Fontes | Argumento compartilhado |
|---|---|---|
| Regra de dependência pra dentro; domínio sem import de framework | clean-ddd, architecture-patterns, ECC, Cosmic, python-architecture-review | testável sem infra + independência de framework (litmus de Cockburn) |
| Port pra toda dependência externa; Clock/UUID como port | clean-ddd, ECC, architecture-patterns, Cosmic | domínio determinístico e testável; trocar tecnologia sem tocar núcleo |
| Injeção por construtor num composition root único | Cosmic, ArjanCodes, ECC, clean-ddd, architecture-patterns | DIP; a boilerplate de mock some quando a dependência é passada, não importada |
| Fake in-memory pro port em teste de use-case (sem DB/Docker/rede) | Cosmic, architecture-patterns, ECC, tdd, clean-ddd | se o teste do use-case precisa de DB, a lógica vazou pra infra; "selo" da arquitetura correta |
| Não mocke o que você possui; teste comportamento, não implementação | Cosmic, tdd, ECC | mock de interno acopla à implementação, quebra no refactor |
| Validar na borda; domínio agnóstico de framework (Pydantic-borda/dataclass-núcleo) | zhanymkanov, Dispatch, Coderik, attrs, ArjanCodes, Cosmic | defeito entra na borda; passe pra dentro um objeto confiável |
| Fatia vertical por domínio pra monólito multi-domínio | zhanymkanov, Dispatch, ECC, python-project-structure (opção DDD) | coesão; times por módulo; "por tipo de arquivo não escala" |
| Domínio rico sobre anêmico; validar VO no construtor | clean-ddd, architecture-patterns, Cosmic | valor inválido não pode ser construído; comportamento pertence à entidade |
| Régua = ruff + type-checker strict + import-linter; `__all__`; absolute imports; snake_case | python-code-style, python-project-structure, zhanymkanov, esfera ArjanCodes, clean-ddd | uma ferramenta rápida encerra o bikeshedding; fronteira enforçada no CI |
| AAA + `test_<unidade>_<cenário>_<esperado>` + testar caminho de erro | python-testing-patterns, tdd, Cosmic | nome carrega o cenário; falha fácil de diagnosticar |
| Funções sobre classes-cerimônia; composição + duck typing sobre herança | Cosmic, ArjanCodes, Rhodes | menos cerimônia, menos acoplamento de herança, mais expressivo |
| "Comece simples; case a arquitetura com a escala; evite CQRS/microserviço prematuro" | clean-ddd, ECC, Cosmic, python-architecture-review | ver seção 5 (leitura anti-cerimônia) |

## 4. Mapa de divergências (fontes que discordam ativamente)

| Eixo | Campo A | Campo B | (Campo C) |
|---|---|---|---|
| Forma do use-case | função (Cosmic, fastapi-python, FastAPI-prod) | classe-handler injetável (clean-ddd, architecture-patterns, ECC) | — |
| Mecanismo de DI | container (clean-ddd/inversify; modern-di/Wireup) | manual, aviso anti-container (ECC, Cosmic) | `Depends`/construtor puro (FastAPI, architecture-patterns) |
| Topologia | camadas (clean-ddd, Cosmic, python-project-structure) | fatia vertical/feature (ECC, zhanymkanov, Dispatch) | híbrido: camadas + pasta por use-case (clean-ddd) |
| Erros | exceção lançada (clean-ddd, Cosmic cap.1) | Result/Response `.success/.error` (architecture-patterns, ArjanCodes-monads) | evento de domínio no lugar da exceção (Cosmic cap.8) |
| Fakes × mocks | fakes, nada de mockar o que você possui (Cosmic, tdd, ECC, architecture-patterns) | `unittest.mock.Mock`/interação livre (python-testing-patterns) | — |
| Controle de tempo | Clock injetável (clean-ddd, ECC) | freezegun/patch (python-testing-patterns) | — |
| Contract tests | suíte de contrato por port contra cada adapter (ECC; Cosmic implícito) | teste de arquitetura/dependência via import-linter (clean-ddd) | silêncio (resto) |
| Port: formalização | ABC explícita (clean-ddd, architecture-patterns) | duck type aceitável (Cosmic, Rhodes) | Protocol estrutural (jellis18, Adam Johnson, Cosmic cita) |
| Pydantic no domínio | manter fora, mapear (Coderik, attrs) | ok pra app pequeno/solo, boilerplate não compensa (pushback HN) | — |
| DTO: localização | `schemas.py` separado (zhanymkanov) | dobrado em `models.py` (Dispatch) | dataclass de comando/evento (Cosmic) |
| Config: entrega | global de módulo (zhanymkanov, Dispatch) | `Depends(get_settings)`+`@lru_cache` (doc oficial FastAPI) | — |
| Classe × funcional | entidades/use-cases como classe (clean-ddd, architecture-patterns, ECC) | "favoreça funcional" (fastapi-python, Cosmic) | — |

## 5. Conflitos com fonte primária (consolidado)

| Opinião | Fonte da opinião | Fonte primária | Natureza do conflito |
|---|---|---|---|
| `line-length = 120` | python-code-style (wshobson) | PEP 8: 79, relaxável a 99 | excede até o limite relaxado; sobrescreve o número do PEP |
| "absolute imports exclusivamente" | python-code-style, python-project-structure | PEP 8: "relativos explícitos são alternativa aceitável" | mais estrito que a spec |
| VO `Money` com float (`10.50`) | clean-ddd-hexagonal | docs `decimal`: float binário impróprio pra dinheiro/contabilidade | *footgun* documentado; inconsistente com o próprio `amount.cents` da skill |
| "Protocol torna ABC obsoleto" (leituras fortes) | leituras populares de PEP 544 | PEP 544: "protocolos **complementam** classes normais, não substituem" | extrapola o não-objetivo declarado do PEP |
| "`@runtime_checkable` dá enforcement de interface" | leituras populares | PEP 544: checa presença de método, não assinatura; opt-in, não 100% confiável | mais fraco do que soa |
| "use async pra todas as chamadas de DB/API" | fastapi-python (mindrally) | docs FastAPI: `def` pra trabalho bloqueante (threadpool) | driver síncrono em `async def` trava o event loop |
| "omita chaves em condicional de uma linha" | fastapi-python (mindrally) | sintaxe Python (sem chaves) | erro factual / copy-paste de prompt JS/TS |
| config como global de módulo (tensão, não erro) | zhanymkanov, Dispatch | docs FastAPI: `Depends(get_settings)`+`@lru_cache` recomendado | doc prefere o padrão-dependência (override em teste) |
| Result/errors-as-values como default | architecture-patterns, ArjanCodes-monads | idioma EAFP documentado de Python | rema contra o idioma; posts omitem esse custo |
| código do livro com `mapper()` clássico | Cosmic Python (stamp 2023) | SQLAlchemy 2.0: `mapper()` standalone removido → `registry.map_imperatively()` | *version drift*; não afeta o argumento de DIP (API-agnóstico) |

Observação de higiene: o `clean-ddd-hexagonal` nomeia `MockOrderRepository` o que é um **Fake** (impl in-memory com estado) — conflito de taxonomia (Fowler/Meszaros), não de fonte primária; importa porque "mocke nos port boundaries" ali significa "injete um fake". `architecture-patterns` e `hexagonal-architecture` nomeiam certo ("InMemory…", "fakes").

## 6. Leitura anti-cerimônia (posição de primeira classe)

O achado transversal que o método do mapa pede pra destacar: **os espécimes maximalistas trazem, eles mesmos, a cláusula de freio.** Não é preciso opô-los de fora — eles se auto-limitam.

- **Cosmic Python** faz disso a espinha retórica: toda técnica ganha uma tabela Prós/Contras porque "programadores conhecem os benefícios de tudo e os *trade-offs* de nada" (epígrafe de Hickey). Escotilhas de fuga repetidas: "se seu app é um wrapper CRUD simples sobre um banco, você não precisa desses padrões — use Django e poupe-se do trabalho"; "*Do I need microservices? Egads, no!*"; "*Do I need CQRS?… Of course not — não são uma disciplina ascética pra se punir*". Adoção incremental: "adote aos poucos… comece pelo service layer"; "duplicação é ok no curto prazo — copie e cole"; "não tente ferver o oceano".
- **`clean-ddd-hexagonal`** abre com "**synthesis opinativa, não um modelo canônico único**" e uma tabela "Use When / Skip When": pule em CRUD simples, protótipo/MVP, time de 1–2, infra fixa. "*Start simple. Evolve complexity only when needed. Most systems don't need full CQRS or Event Sourcing.*" Escada de complexidade L1→L5, "não pule níveis".
- **`hexagonal-architecture` (ECC)**: "o hexágono é conceitual — a maioria dos apps tem 2–4 ports, não seis"; "em base pequena, um método público do handler basta como driver port"; migração strangler, "sem *big-bang rewrites*".
- **`python-architecture-review` (rknall)**: a meta-regra é "sinalize *over-engineering* **ou** *under-engineering*" — casa a arquitetura com a escala.

Consequência pro radar: quando uma skill "prega DDD/hexagonal", ela quase sempre prega *também* "não use isto se o problema não pede". A referência argumentada é o conjunto de posições *com seus freios*, não o superconjunto de patterns.

## 7. Skills de baixo argumento (higiene do radar)

Nem tudo no skills.sh argumenta. Pra calibrar confiança:

- `fastapi-python` (mindrally): lista de regras **sem nenhum argumento** ("sem argumento — só regra" em tudo), essencialmente o prompt "You are an expert in Python and FastAPI" repackaged, com dois *tells* de copy-paste (ver seção 5). Baixa confiança.
- `python-testing-patterns` (wshobson): regra-pesada, luz de razão; endossa `Mock`/freezegun sem justificar. Útil como catálogo de sintaxe pytest, fraco como fonte de argumento — e no ponto de tempo/mock rema contra o consenso e contra o LUC.
- `python-architecture-review` (rknall): *checklist* de revisão, "sem argumento" por design no nível de item; valor é o mapa de amplitude (10 áreas), não a opinião.
- As mais bem-argumentadas e transferíveis: `clean-ddd-hexagonal` (ccheney), `architecture-patterns` (wshobson, Python-native), `hexagonal-architecture` (affaan-m — única forte em contract tests, imutabilidade e DI anti-container), e `tdd` (linhagem Matt Pocock — a mais afiada em fakes/DI/design de interface). Fora do skills.sh, Cosmic Python é a mais completa e a mais honesta sobre *trade-offs*.

## 8. Fontes (URLs e fidelidade)

**skills.sh + repos indexados / cópias vendorizadas (lidas na íntegra salvo nota):**
- `clean-ddd-hexagonal` — ccheney/robust-skills — https://www.skills.sh/ccheney/robust-skills/clean-ddd-hexagonal (+ referências LAYERS/TESTING/HEXAGONAL/DDD-TACTICAL/CHEATSHEET no HEAD do repo)
- `architecture-patterns` — wshobson/agents — https://github.com/wshobson/agents (raw)
- `hexagonal-architecture` — affaan-m/everything-claude-code — https://www.skills.sh/affaan-m/everything-claude-code/hexagonal-architecture
- `python-code-style`, `python-project-structure`, `python-testing-patterns` — wshobson/agents — https://www.skills.sh/wshobson/agents/python-code-style (+ vendorizadas no HEAD)
- `tdd` — linhagem Matt Pocock/superpowers (skills.sh Testing topic lista `test-driven-development by obra/superpowers`)
- `fastapi-python` — mindrally/skills — https://www.skills.sh/mindrally/skills/fastapi-python (regras lidas; argumentos ausentes)
- `python-architecture-review` — rknall/claude-skills (raw GitHub)
- Índice: https://www.skills.sh/ , https://www.skills.sh/topic , https://www.skills.sh/topic/testing

**Cosmic Python (lidos na íntegra via browser UA — o site 403 o fetcher default):**
- preface, part1/2, chapter_01_domain_model, 02_repository, 03_abstractions, 04_service_layer, 05_high_gear_low_gear, 06_uow, 07_aggregate, 08_events_and_message_bus, 09_all_messagebus, 12_cqrs, 13_dependency_injection, epilogue_1, appendix_validation — em https://www.cosmicpython.com/book/
- Não lidos: chapter_10_commands, 11_external_events, appendix_project_structure/csvs/django

**Esfera ArjanCodes e adjacentes (lidos na íntegra):**
- https://arjancodes.com/blog/python-dependency-injection-best-practices/ , /dependency-inversion-principle-in-python-programming/ , /solid-principles-in-python-programming/ , /python-functors-and-monads/
- https://jellis18.github.io/post/2022-01-11-abc-vs-protocol/
- https://adamj.eu/tech/2021/05/18/python-type-hints-duck-typing-with-protocol/
- https://threeofwands.com/why-i-use-attrs-instead-of-pydantic/
- https://coderik.nl/posts/keep-pydantic-out-of-your-domain-layer/
- https://blog.szymonmiks.pl/p/dont-put-your-business-logic-in-the-controllers/
- https://python-patterns.guide/gang-of-four/composition-over-inheritance/
- Snippet: ArjanCodes "Stop Overusing Classes" (youtube yFLY0SVutgM), death.andgravity/over-composition, realpython inheritance-vs-composition e lbyl-vs-eafp

**FastAPI produção (lidos):**
- https://github.com/zhanymkanov/fastapi-best-practices (README, 871 linhas)
- https://github.com/Netflix/dispatch (árvore `src/dispatch/`, incident/models.py, api.py)
- https://github.com/mjhea0/awesome-fastapi
- Docs oficiais (PRIMÁRIA): https://fastapi.tiangolo.com/tutorial/bigger-applications/ , https://fastapi.tiangolo.com/advanced/settings/

**Fontes primárias (âncoras de conflito):**
- PEP 8 — https://peps.python.org/pep-0008/ (line length 79/99; imports relativos aceitáveis)
- PEP 544 — https://peps.python.org/pep-0544/ (Protocol complementa, não substitui ABC; runtime_checkable = presença, não assinatura)
- PEP 557 (dataclasses: sem validação em runtime por escopo)
- docs `decimal` — https://docs.python.org/3/library/decimal.html (float impróprio pra dinheiro/contabilidade)
- docs SQLAlchemy 2.0 — https://docs.sqlalchemy.org/en/20/orm/mapping_styles.html (`mapper()` standalone removido)
