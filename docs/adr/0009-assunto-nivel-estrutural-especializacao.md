# ADR 0009 — Assunto: nível estrutural dentro da Área, unidade de especialização dos primitivos

- **Status:** Accepted
- **Data:** 2026-07-01
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0005](0005-primitivos-descritivos-spine-especializacao.md) (relocação: a especialização passa da Área para o Assunto), [ADR-0006](0006-faseamento-por-areas.md) (faseamento `em breve`/`ativa` um nível abaixo), [ADR-0003](0003-nucleo-dominio-multi-borda.md) (o núcleo abriga estes níveis), [CONTEXT.md](../../CONTEXT.md) (verbete Assunto; ambiguidade "Área × Assunto × categoria")

## Contexto

Finanças é a Área-piloto — a única modelada a fundo — e já começa a tensionar a hierarquia de dois níveis (`Área → itens`). Hoje a Conta e o Lançamento pendem direto de Finanças, num só balaio. Mas Finanças não trata de uma coisa só: além dos **pagamentos recorrentes** (a máquina Conta/Lançamento), o dono já enxerga uma frente de **investimentos** — posições, aportes — que é *outro modelo*, com outros primitivos, e que não cabe no mesmo contexto dos pagamentos. Deixar os dois no mesmo nível embola a navegação e a modelagem.

A tentação é resolver com um rótulo (categorizar itens) ou com um agrupamento só de UI. Nenhum dá conta: não é classificar os *mesmos* itens, é abrigar *modelos diferentes* lado a lado dentro da mesma Área. E cravar isso como ontologia universal ("toda Área tem sub-níveis") a partir de uma Área só é exatamente a abstração-prematura que o [ADR-0005](0005-primitivos-descritivos-spine-especializacao.md) existe para evitar.

## Decisão

Introduzir o **Assunto** (`Subject`) como um nível estrutural dentro da Área: `Painel → Área → Assunto → itens`. As decisões que o definem:

- **O Assunto é a unidade de especialização, não a Área.** Cada Assunto especializa os primitivos com nome e estrutura próprios — Pagamentos Recorrentes especializa Gerador→Conta e Registro→Lançamento; um futuro Investimentos especializaria uma forma totalmente diferente. A Área passa a ser um *agrupamento de Assuntos*. Isso **revisa** o [ADR-0005](0005-primitivos-descritivos-spine-especializacao.md), que atribuía a especialização à Área.
- **Assuntos são disjuntos.** Cada Assunto mora nas suas próprias tabelas, sem coluna discriminadora nem item compartilhado entre Assuntos — o mesmo padrão "tabelas próprias por especialização" que o 0005 firmou para Finanças, aplicado um nível abaixo. Consequência direta: "Pagamentos Recorrentes" *é* o `bills`/`payments`/`attachments` de hoje, então re-parentear o que existe é **zero migração de dado** (importa: o Postgres de prod guarda dado real e irreplicável do casal — [ADR-0007](0007-autonomia-total-do-agente.md)).
- **Assunto é config declarada pelo produto**, como a Área (catálogo estático em código), não dado do Lar. O casal *usa* os Assuntos que o LUC traz; não inventa "Investimentos" num formulário.
- **Assunto tem ciclo de vida `em breve`/`ativa`** — o faseamento do [ADR-0006](0006-faseamento-por-areas.md) um nível abaixo. A Área `ativa` se apresenta como um mini-Painel de Assuntos (Pagamentos Recorrentes `ativa`; Investimentos `em breve`), do mesmo jeito que o Painel apresenta as Áreas. O estado da Área pode passar a ser *derivado*: `ativa` sse tem ≥1 Assunto `ativa`.
- **A universalidade fica em aberto.** Assunto é uma forma descoberta em Finanças; outras Áreas podem ou não adotá-la. Não se crava "toda Área tem Assunto" — fiel à filosofia descritiva do 0005.

Primeiro (e único, por ora) Assunto: **Pagamentos Recorrentes** (slug `pagamentos-recorrentes`).

## Justificativa

- **Casa com o 0005 em vez de brigar.** O 0005 escolheu "tabelas próprias por especialização" e adiou o motor genérico até a repetição aparecer. Assunto-disjunto é *o mesmo movimento* um nível abaixo: cada Assunto é um modelo próprio, não a configuração de um spine genérico. A generalização, se vier, é extraída por refactor — não presumida.
- **Barato e não-destrutivo.** Disjunção + config = zero migração agora: as tabelas de hoje viram o Assunto Pagamentos Recorrentes; a mudança é config + rota + UI, sem tocar esquema no dado de prod.
- **Respeita o alerta de abstração-prematura.** Escopar a Finanças (piloto) e deixar a universalidade em aberto é o oposto de cravar uma ontologia de seis Áreas a partir de uma. Se Investimentos (2º Assunto) confirmar a forma, ótimo; se outra Área nunca precisar de Assuntos, também ótimo.
- **Honestidade visual fractal.** "Investimentos em breve" dentro de Finanças é o mesmo contrato do Painel cheio de `em breve`: mostra a ambição sem mentir sobre o pronto ([ADR-0006](0006-faseamento-por-areas.md)).

## Consequências

- **Positivas:** Finanças ganha lugar para crescer sem embolar (Pagamentos e Investimentos viram vizinhos, não sinônimos); cada Assunto novo é um incremento isolado (tabelas próprias, rota própria); zero migração no dado existente; o vocabulário fica coerente (o glossário ganhou o verbete Assunto e a ambiguidade "Área × Assunto × categoria").
- **Rota:** o cockpit de Finanças desce de `/areas/financas` para `/areas/financas/pagamentos-recorrentes`; a raiz da Área vira o mini-Painel de Assuntos. Migração de rota, mecânica, sem tocar dado.
- **Negativas / aceito:** mais um nível é mais uma coisa a manter (config, rota, estado). Aceito porque a necessidade é real e já (Finanças-piloto), não especulativa. E se a universalidade não se confirmar, "Assunto" pode acabar um conceito só-de-Finanças — aceitável: é fronteira provisória (CONTEXT.md), não núcleo.
- **Revisões que este ADR carrega:** o [ADR-0005](0005-primitivos-descritivos-spine-especializacao.md) muda a unidade de especialização (Área→Assunto); o [ADR-0006](0006-faseamento-por-areas.md) estende o faseamento ao Assunto e aposenta o apelido "Finanças (Pagamentos)" (Finanças deixou de *ser* Pagamentos; agora *contém* Pagamentos Recorrentes ao lado de outros). Ambos ganham nota inline.

## Opções rejeitadas

- **Rótulo transversal (categorizar itens: Moradia, Lazer).** Resolve *classificação* dos mesmos itens, não a convivência de *modelos diferentes* (pagamentos × investimentos são tabelas e primitivos distintos, não etiquetas sobre a mesma Conta). Fica reservado como uma *terceira* coisa possível no futuro (CONTEXT.md, "Área × Assunto × categoria") — e não deve tomar o nome de Assunto.
- **Só agrupamento de UI (abas/seções sem modelo).** Arruma a tela, mas não dá casa a um modelo próprio nem a faseamento; quando Investimentos chegar com suas tabelas, a UI-só não tem onde ancorá-las.
- **Coluna/discriminador compartilhado (item pertence a um Assunto via FK numa tabela comum).** Traria migração de esquema no dado de prod e um acoplamento entre Assuntos (mesma tabela) que contradiz "não se misturam". Cai junto com o avulso: não há item que viva em dois Assuntos.
- **Não fazer nada (seguir em dois níveis).** O balaio segue misturando pagamentos e investimentos; a necessidade é atual, não hipotética. Adiar só troca o custo por dívida de navegação e modelagem.
