# ADR 0006 — Faseamento por Áreas: "cara completa" na largada, ativação uma a uma

- **Status:** Accepted
- **Data:** 2026-06-26
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0005](0005-primitivos-descritivos-spine-especializacao.md) (cada Área ativa declara suas especializações), [CONTEXT.md](../../CONTEXT.md) (Painel, estados `em breve`/`ativa`, Fronteira de escopo)

## Contexto

O LUC quer se apresentar, desde a largada, como um portal completo da vida — todas as Áreas (Finanças, Saúde, Gastronomia, Imóvel, Supermercado, Carro) visíveis no Painel — embora só uma vá existir de fato no início. Há duas leituras de "completo" que precisam não se confundir: completo de *fachada* (todas as Áreas aparecem) e completo de *construção* (todas funcionam).

Sem essa distinção fixada, o projeto se obriga a construir seis Áreas para "lançar", e morre na largura — o modo de falha clássico de apps de "organizar a vida".

## Decisão

**Faseamento por Áreas, uma de cada vez.** Cada Área tem um estado de ciclo de vida: **`em breve`** (aparece no Painel, sem funcionalidade) ou **`ativa`** (modelada e operável). A largada mostra **todas** as Áreas — a maioria `em breve` — e Áreas viram `ativa` **sob demanda real**, uma a uma. **Finanças** (Pagamentos) é a primeira Área ativa.

**`em breve` é um estado honesto e aceitável por tempo indefinido**, não uma dívida com prazo. Não há obrigação de ativar todas; ativa-se o que se for usar.

## Justificativa

- **"Cara completa" é promessa visual, não de engenharia.** O Painel cheio dá a sensação de cockpit-da-vida-inteira (o produto que o dono quer) sem exigir que tudo esteja construído. `em breve` é a forma honesta de mostrar a ambição sem mentir sobre o pronto.
- **Defende contra a morte por largura.** Fixar que se ativa uma Área por vez, sob demanda, é o que impede o projeto de se afogar tentando entregar seis frentes. Casa com a Fronteira de escopo (CONTEXT.md).
- **Cada ativação é incremental e barata** graças ao spine+especialização ([ADR-0005](0005-primitivos-descritivos-spine-especializacao.md)): ativar uma Área é declarar suas especializações dos primitivos, não erguer um app novo.

## Consequências

- **Positivas:** lançável com uma Área; o Painel comunica visão completa desde o dia 1; cada Área nova é um incremento isolado.
- **Negativas / aceito:** Áreas `em breve` por muito tempo podem parecer abandono. Aceito: a honestidade visual ("em breve") é melhor que esconder a ambição ou que prometer datas. O estado é honesto justamente por não carregar prazo.
- O estado de Área (`em breve`/`ativa`) é um dado de primeira classe do Painel — e provavelmente a primeira coisa que o sistema visual (Noturno, no design) precisa representar.

## Opções rejeitadas

- **Lançar só com as Áreas prontas (Painel parcial).** Mostraria só Finanças no início — honesto, mas joga fora a alma do produto (o cockpit da vida inteira) e a sensação de completude que o dono quer desde a largada.
- **Construir as seis antes de lançar.** O caminho mais curto para nunca lançar; é exatamente a morte-por-largura que a Fronteira de escopo existe para evitar.
