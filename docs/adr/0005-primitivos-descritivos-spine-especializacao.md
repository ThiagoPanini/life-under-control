# ADR 0005 — Primitivos de domínio são descritivos (spine + especialização por Área), não um schema fechado

- **Status:** Accepted
- **Data:** 2026-06-26
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0003](0003-nucleo-dominio-multi-borda.md) (o núcleo abriga estes primitivos), [CONTEXT.md](../../CONTEXT.md) ("Como ler", primitivos)

## Contexto

O LUC se apresenta com "cara completa" — todas as Áreas visíveis na largada, a maioria `em breve` ([ADR-0006](0006-faseamento-por-areas.md)) — mas só uma Área (Finanças) foi modelada a fundo. Surge a tentação de cravar, a partir dessa única Área, uma ontologia universal: "todo conteúdo do LUC é um destes N tipos", e implementar N tabelas genéricas que cada Área configura.

O risco é a **abstração prematura**: fixar o esqueleto de dados de seis Áreas tendo examinado uma. Já se veem, sem modelar, formas que tensionam um conjunto fechado — regra-recorrente (a Conta), documento-que-vence (CNH/IPVA), meta/limite (carboidratos por dia). Cravar agora é apostar o schema em Áreas não-examinadas.

## Decisão

**Os primitivos (Tarefa, Registro, Métrica, Indicação, Gerador) são uma linguagem-padrão descritiva, não um schema prescritivo.** São as formas recorrentes *descobertas até aqui*; o catálogo **cresce** conforme cada Área é trabalhada (CONTEXT.md, "Como ler"). Um primitivo novo entra quando os exemplos reais de uma Área param de caber nos atuais.

**Cada primitivo é um spine genérico que cada Área especializa** com nome e estrutura próprios: um `Payment` (Lançamento) é a especialização de `Entry` (Registro) em Finanças; um `Bill` (Conta) é a instância do Gerador em Finanças. Ao ativar uma Área, declaram-se suas especializações — não se reescreve um modelo bespoke por Área.

O **mecanismo de persistência** dessa especialização (tabela única com discriminador, tabela por especialização, ou spine + payload estruturado) **fica deliberadamente em aberto**, a firmar quando a 2ª/3ª Área der evidência real. Este ADR fixa a *filosofia* (descritivo, spine+especialização), não o DDL.

## Justificativa

- **Evita a reconstrução cara que o projeto teme.** Uma ontologia universal cravada de uma Área quebra na primeira Área que não couber — e aí migra-se schema e reescreve-se UI. Descritivo mantém o valor (vocabulário coerente para o design e a implementação) sem apostar o que não se sabe.
- **Honesto sobre o estado.** 1 de 6 Áreas modeladas não autoriza um "sempre". A camada de primitivos é a *fronteira provisória* do CONTEXT.md; as regras que valem mesmo são as invariantes (núcleo estável).
- **Spine+especialização é o que torna "cresce por Área" barato.** Ganha-se consistência (toda Área fala Registro/Tarefa/Métrica) sem o custo de um motor genérico construído cedo demais. A generalização, se vier, é *extraída* por refactor quando a repetição for visível — não presumida.

## Consequências

- **Positivas:** o Claude Design recebe um vocabulário estável sem um schema travado; cada Área nova é uma adição, não uma renegociação do núcleo; a decisão "isto deve virar um motor genérico?" é adiada até haver evidência.
- **Negativas / aceito:** sem um schema genérico imposto, há risco de *inconsistência* entre Áreas (cada uma especializar de um jeito). Mitigam a disciplina do spine compartilhado e a revisão. É a troca consciente: tolera-se alguma divergência para não pagar abstração prematura.
- O nome e o identificador de código do **Gerador** são provisórios (CONTEXT.md) — firmam com a 2ª Área. Aceitar isto é aceitar um termo "em aberto" no glossário, de propósito.

### 1ª instanciação — Finanças (2026-06-28)

A 1ª Área ativa firmou o padrão na prática: Finanças persiste em **tabelas próprias** (`bills`, `payments`, `attachments`), com os tipos no vocabulário especializado (`Bill`/`Payment`/`Attachment`) — **não** num spine genérico (`generators`/`entries`). O spine só será **extraído por refactor** se a 2ª Área mostrar a mesma forma (gatilho de extração do [ADR-0003](0003-nucleo-dominio-multi-borda.md)). É a filosofia deste ADR em ato: descritivo agora, generalização quando a repetição aparecer — não presumida de uma Área só.

## Opções rejeitadas

- **Schema prescritivo (N tipos genéricos, Áreas configuram).** Consistência por construção, mas exige que a ontologia derivada de Finanças valha para Saúde/Carro/Imóvel — não verificável hoje. É a aposta cara que o projeto declarou querer evitar.
- **Sem primitivos (cada Área modela do zero).** O extremo oposto: nenhuma linguagem comum, seis mini-modelos sem costura, design inconsistente. Joga fora o ganho real de ter um spine.
