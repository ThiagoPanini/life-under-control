# Life Under Control

Organizador da vida adulta de um **Lar** — um casal com acesso idêntico aos mesmos dados, operado inteiramente de dentro do portal: tudo nasce de um ato na interface e vira fato no banco, nunca artefato versionado. Reúne num só lugar as **Áreas** da vida (Finanças, Saúde, Carro…); cada Área se constrói a partir de um punhado de primitivos e de vistas transversais. Repositório single-context: este é o único glossário.

## Como ler

O glossário tem duas camadas, de durabilidade diferente — saber em qual você está é o que evita reconstrução cara.

- **Núcleo estável** — as **Invariantes** ao final. Regras de *significado* que não mudam; código que as viola é bug. É a rocha sobre a qual o resto se apoia.
- **Fronteira provisória** — o catálogo de **primitivos** e o vocabulário de cada Área. São as formas *descobertas até aqui* — hoje, sobretudo de Finanças, a única Área trabalhada a fundo. Não é um schema fechado; é uma linguagem-padrão **descritiva** que mantém as Áreas coerentes. Cresce conforme cada Área é trabalhada: um primitivo novo só entra quando os exemplos reais de uma Área param de caber nos atuais. Modelar uma vida a dois é descoberta contínua — espere esta camada mudar, e mude-a de propósito.

**Spine + especialização.** Cada primitivo é um *spine* genérico; cada **Assunto** de uma Área o **especializa** com nome e estrutura próprios — um Lançamento é o Registro de Pagamentos Recorrentes; uma Conta é o Gerador de Pagamentos Recorrentes. Uma Área *agrupa* seus Assuntos; é o Assunto que *declara* suas especializações, e dois Assuntos nunca se misturam no mesmo modelo. *Como* isso vira tabela é matéria de ADR, não daqui.

## Linguagem

### O Lar e o portal

**Life Under Control (LUC)** — O portal pessoal que reúne, num só lugar, as Áreas da vida adulta de um Lar.

**Lar** (`Household`) — A unidade que possui todos os dados; composta por exatamente duas Pessoas com acesso simétrico. _Evite_: workspace, tenant, conta, espaço.

**Pessoa** (`User`) — Cada um dos dois integrantes do Lar; serve para autenticar e para atribuir autoria (quem pagou, de quem é a fatura), nunca para restringir acesso. _Evite_: usuário, membro, perfil, papel.

**Área** (`Area`) — Um domínio da vida apresentado como módulo no portal: Finanças, Saúde, Gastronomia, Imóvel, Supermercado, Carro. Cada Área está `em breve` ou `ativa`. _Evite_: categoria, seção.

**Assunto** (`Subject`) — Um recorte estrutural dentro de uma Área, com seu próprio modelo (seus próprios primitivos especializados), que não se mistura com os demais Assuntos da mesma Área. Uma Área `ativa` é composta de um ou mais Assuntos, cada um `em breve` ou `ativa`; a Área reúne seus Assuntos como o Painel reúne as Áreas. É o Assunto — não a Área — que especializa os primitivos. Nem toda Área precisa de Assuntos: é uma forma descoberta em Finanças, a Área-piloto, que outras podem ou não adotar. Instância de Finanças: Pagamentos Recorrentes. _Evite_: categoria, seção, sub-área, módulo, aba.

**Painel** (`Dashboard`) — A visão geral de largada: todas as Áreas lado a lado, a maioria ainda `em breve`. _Evite_: dashboard, home.

### Os primitivos (fronteira)

As formas recorrentes descobertas até aqui. Dois grupos: **itens** (o que você cria e consulta) e **geradores** (regras que projetam itens). Não é um conjunto fechado — ver "Como ler".

**Itens**

**Tarefa** (`Task`) — Algo a fazer, de estado pendente→feito, sempre ancorado numa Área; quando tem data, aparece na Agenda. _Evite_: afazer, compromisso, to-do, pendência (são a mesma coisa — use Tarefa).

**Registro** (`Entry`) — Um fato já consumado, com data e às vezes valor, ancorado numa Área; é o *spine* dos fatos, que cada Assunto especializa (em Pagamentos Recorrentes, o Lançamento). _Evite_: log, evento, transação.

**Métrica** (`Measurement`) — Um ponto numa série temporal de um número que se acompanha: peso, resultado de exame, preço de um item, carboidratos. _Evite_: indicador, KPI, estatística.

**Indicação** (`Tip`) — Uma candidata a experimentar e depois avaliar — estado quero→experimentei→nota. Instâncias: Restaurante, Café, Receita (esta talvez mais rica — uma receita também é *conteúdo*: ingredientes, preparo; resolve-se quando Gastronomia for trabalhada). _Evite_: curadoria (isso é a *lista*, não o item), favorito, wishlist, lista de desejos.

**Geradores**

**Gerador** *(nome e identificador de código provisórios — firmam quando a 2ª Área chegar)* — Uma regra permanente que projeta ocorrências futuras no tempo sem materializá-las. Cada ocorrência aparece projetada na Agenda; ao se concretizar, ou nasce um fato (um Registro) ou se cumpre uma Tarefa, conforme exija ação. Instância em Pagamentos Recorrentes (Finanças): Conta. _Evite_: agendamento, cron, lembrete.

### As vistas transversais

**Agenda** (`Agenda`) — A vista que reúne, no tempo, toda Tarefa com data e toda ocorrência projetada por um Gerador, de qualquer Área. Não guarda dados próprios — projeta. _Evite_: calendário.

**Tarefas** (a vista) — A vista que reúne as Tarefas por Área, no estilo de um organizador. Como a Agenda, é projeção, não depósito. Distinta de **Tarefa** (o item).

### Finanças (Área-âncora)

Única Área trabalhada a fundo por enquanto; as demais ganham vocabulário aqui quando forem trabalhadas. Finanças é composta de Assuntos: o primeiro é **Pagamentos Recorrentes** (`ativa`), lar da Conta e do Lançamento; outros (Investimentos…) seguem `em breve` até serem trabalhados.

**Conta** (`Bill`) — A instância do Gerador em Pagamentos Recorrentes: a regra de um pagamento que se repete (condomínio, luz, fatura); guarda a periodicidade e a regra do vencimento esperado, nunca um valor fixo. Está `ativa` ou `encerrada` — encerrar (com data) para de projetar dali pra frente e guarda o histórico, sem apagar nada. _Evite_: despesa, boleto, assinatura, conta bancária.

**Lançamento** (`Payment`) — A especialização de Registro em Pagamentos Recorrentes: o registro de um pagamento efetuado; nasce na quitação, com o valor real do momento e a data de pagamento, e ganha Competência. Todo Lançamento nasce de uma Conta — o LUC não registra gasto avulso (um lanche de fim de semana não entra; a conta de luz do mês, sim). É a vida-administrativa *recorrente* da Fronteira de escopo. _Evite_: pagamento previsto, fatura, parcela, gasto avulso.

**Competência** (`ReferencePeriod`) — O período a que um Lançamento se refere (o condomínio "de julho"), independente da data em que foi pago. _Evite_: mês de pagamento, vencimento.

### Capacidades transversais

**Recorrência** (`Recurrence`) — A cadência de um Gerador (e, às vezes, de uma Tarefa que se repete): com que frequência as ocorrências futuras são projetadas, sem criá-las até acontecerem.

**Anexo** (`Attachment`) — Arquivo associado a qualquer item: comprovante, exame digitalizado, foto.

**Processo** (`Process`) — Um objetivo com etapas (tirar a CNH, tocar uma reforma): uma Tarefa com sub-Tarefas. _Evite_: projeto, jornada.

## Fronteira de escopo — o que o LUC não é

O LUC é um cockpit para a vida-administrativa recorrente de um casal. Dizer o que ele **não** é protege contra o escopo infinito que mata apps de "organizar a vida".

- **Não é multi-tenant nem produto.** Duas Pessoas, sem convite, sem plano, sem onboarding de estranho. Nada de "deixar outro casal usar".
- **Não tem terceiros nem é rede social.** Sem comentário de fora, feed ou compartilhamento pra amigo. Os dois únicos humanos são o casal; o dado não sai.
- **Não é app de notas livres nem wiki.** Tudo é um primitivo com *forma* — não página de markdown solta. É o que separa um cockpit de uma gaveta de bagunça, e é por isso que os primitivos existem.
- **Não é vida de trabalho.** O LUC é a vida do Lar (doméstica e pessoal); tarefa de emprego mora na ferramenta de trabalho, não aqui.
- **Registra, não opera.** O LUC nunca movimenta dinheiro, não dá ordem em corretora, não paga por API — registra o que o casal já fez ou decidiu. Integração de *entrada* (OCR de boleto, importação de extrato/posições, Open Finance para *acompanhar*) é borda de ingestão de fato, permitida sob demanda — só mais um jeito de um fato chegar ao portal. *Operar* fica de fora, por categoria.
- **"Cara completa" ≠ "tudo construído".** Mostrar todas as Áreas na largada é honestidade visual; `em breve` é estado honesto por tempo indefinido. As Áreas viram `ativa` uma de cada vez, sob demanda real.

## Ambiguidades sinalizadas

**Tarefa (item) × Agenda/Tarefas (vistas).** "Tarefa" é um tipo de item; "Agenda" e "Tarefas" são duas lentes sobre o mesmo conjunto — a Agenda ordena por tempo, a vista de Tarefas agrupa por Área. As vistas nunca têm dados próprios.

**Conta × Lançamento.** A Conta é a regra que se repete e só conhece o "quando"; o Lançamento é o fato de um pagamento e só nasce com o "quanto", na quitação. Reajustar a Conta nunca altera Lançamentos passados.

**Imutável (sistema) × corrigível (pessoa).** A invariante #4 trava o *sistema*, não as Pessoas: reajustar a Conta nunca reescreve um Lançamento, e um fato nasce com o valor do momento (não espelha a Conta). Ela não proíbe as Pessoas de corrigir o que registraram — Lançamentos e Contas são editáveis pelas duas (acesso simétrico, #1); o controle do dado é humano. "Quem pagou" é autoria, nunca trava de edição.

**Ocorrência projetada × exceção.** Um Gerador projeta ocorrências; mexer numa ocorrência específica (adiar "esse mês pago dia 20", pular "esse mês não tem") é registrar uma **exceção** — um fato guardado contra o Gerador. Não é reajustar a regra (não reescreve passado nem futuro inteiro) nem é um Lançamento (não aconteceu). Exceção é fato, não mudança de regra.

**Indicação (item) × lista.** Uma Indicação é uma candidata; a "lista de restaurantes" é um agrupamento/vista, não um primitivo à parte. Não chame o item de "curadoria".

**"Despesa" — termo banido.** Foi usado para duas coisas distintas (um gasto financeiro e a lista do supermercado). Não use "despesa": um pagamento é um Lançamento; a lista de mercado é a Área Supermercado.

**Área × Assunto × categoria.** Três coisas distintas. **Área** é o módulo de primeiro nível (Finanças). **Assunto** é um recorte estrutural *dentro* da Área, com modelo próprio (Pagamentos Recorrentes) — um sub-módulo, não um rótulo. Uma **classificação interna transversal** (Moradia, Lazer) seria uma terceira coisa — um rótulo sobre itens — que hoje não existe; se vier, não é Área nem Assunto.

**Mês em curso × mês fechado.** O mês corrente é sempre um mês **em curso**: exibe o acumulado até aqui e **nunca entra em comparação** — variação mês-a-mês só existe entre meses **fechados** (o último fechado contra o anterior). Um mês recém-começado não é "queda de 100%"; é um mês parcial, e a UI o marca como "em curso". A distinção é derivada do relógio (`Clock`), nunca persistida — corolário da invariante #3.

## Invariantes (núcleo estável)

Regras de domínio que sempre valem; código que as viola é bug. Esta é a camada que **não** muda — distinta da fronteira de primitivos, que cresce.

1. **Acesso simétrico.** Tudo que uma Pessoa vê, a outra vê. Não há item privado nem permissão por recurso; Pessoa é para autenticar e atribuir, nunca para autorizar.
2. **Exatamente duas Pessoas.** O Lar tem duas Pessoas e nunca mais, e não existe auto-cadastro.
3. **Persistir fatos, derivar interpretações.** Guarda-se o que aconteceu (datas, valores pagos); "atrasado", juros, pontualidade e "vencimento esperado" são sempre calculados, jamais colunas.
4. **O Registro fotografa, não espelha.** Um fato nasce com o valor do momento e é imutável quanto a isso; mudar uma Conta nunca reescreve o passado.
5. **A Conta projeta o "quando", nunca o "quanto".** O valor de um pagamento só existe quando a conta chega; até lá, o vencimento é uma projeção derivada da Conta.
6. **Dinheiro é exato.** Valores monetários são sempre exatos e em BRL.
7. **Vistas não guardam.** Agenda e Tarefas projetam itens das Áreas; não possuem dados próprios.

## Diálogo de exemplo

**Dono** — No fim do mês eu pago o condomínio. Isso é uma Conta ou um Lançamento?

**Dev** — A **Conta** é a regra: "condomínio, todo dia 10" — uma instância do **Gerador**. Ela não sabe o valor. Quando o boleto chega e você paga, nasce um **Lançamento** com o valor real daquele mês, na **Competência** de julho.

**Dono** — E se vier mais caro porque paguei atrasado?

**Dev** — O Lançamento guarda o valor pago e a data; "juros" não é campo nenhum — a gente **deriva** de quanto passou do previsto. Fato guardado, interpretação calculada.

**Dono** — Esse pagamento aparece pra minha esposa?

**Dev** — Igual pra vocês dois — **acesso simétrico**. O "quem pagou" fica como nota de autoria; não muda quem vê.

**Dono** — E o aviso de que vai vencer?

**Dev** — Vem da Conta, projetado na **Agenda**. Enquanto não existe Lançamento de julho e a janela já passou, a Agenda acusa como pendente — sem inventar valor.
