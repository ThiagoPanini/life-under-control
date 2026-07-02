# ADR 0010 — Gráficos financeiros em visx, revertendo a postura "SVG puro sem lib de chart"

- **Status:** Accepted
- **Data:** 2026-07-02
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0003](0003-nucleo-dominio-multi-borda.md) (núcleo isolado da borda; a lib fica só na borda de apresentação), PRD [#45](https://github.com/ThiagoPanini/life-under-control/issues/45) (Implementation Decision 8), issue [#55](https://github.com/ThiagoPanini/life-under-control/issues/55)

## Contexto

O `TrendCard` original (sparkline de "Total pago por mês") e os primeiros sparklines de `BillCard` foram desenhados com **SVG puro** — `<path>`/`<line>` calculados à mão, sem biblioteca de chart. Era uma postura deliberada: poucos pontos, uma curva simples, e trazer uma lib inteira pra isso parecia desproporcional.

O PRD #45 pede mais dos gráficos financeiros: barras por competência com três estados visuais (fechado/em-curso/lacuna), linha tracejada de média 12m atravessando o eixo, tooltip por barra com hover **e** foco de teclado, realce no hover, e o mesmo componente parametrizável por `estado` pra reuso na "História · 12 competências" (#59). Escalas (`scaleBand`, `scaleLinear`), interação acessível e composição de camadas SVG começam a pesar quando calculadas à mão — o código de posicionamento cresce mais rápido que o de domínio, e cada gráfico novo (#55, #56, #59) reimplementaria a mesma mecânica de eixo/escala/hover do zero.

## Decisão

**Os gráficos financeiros passam a usar `visx`** (`@visx/shape`, `@visx/scale`, `@visx/group`, `@visx/curve`) — primitivos SVG de baixo nível, não um chart-engine com API de alto nível. `visx` não desenha nada sozinho: cada elemento (`Bar`, `LinePath`, `AreaClosed`, `Group`) continua sendo um nó SVG comum, então a estética do contrato de design (`docs/design/`) e a acessibilidade (tooltip por foco, `aria-label`, tabela `sr-only` equivalente) continuam de responsabilidade do componente, não da lib.

Isso **reverte** a postura "SVG puro sem lib de chart" registrada informalmente no código do `TrendCard`/`Sparkline` originais — nunca havia sido um ADR, só uma escolha implícita. A lib entra só na borda de apresentação (`components/financas/*`, `components/ds/*`); o núcleo (use-cases como `derive-barras-competencia.ts`) segue sem nenhuma dependência de visx, produzindo só a série de pontos que o componente consome.

## Justificativa

- **Tree-shakeable por pacote.** `visx` não é um bundle monolítico — cada `@visx/*` é importado à parte (`shape`, `scale`, `group`, `curve`); só entra no bundle o que o componente de fato usa.
- **Escalas testadas em vez de calculadas à mão.** `scaleBand`/`scaleLinear` (d3-scale por baixo) resolvem posicionamento e domínio/range de forma testada; o código à mão equivalente é mais superfície pra bug de off-by-one em cada gráfico novo.
- **Continua sendo SVG comum.** Como os primitivos do visx renderizam elementos SVG nativos, o componente mantém controle total de estilo (tokens do contrato de design), acessibilidade (`tabIndex`, `role`, `aria-label`, handlers de `onFocus`/`onBlur`) e `motion-safe:` — nada disso fica preso atrás de uma API de chart opinativa.
- **Reuso entre #55/#56/#59.** O mesmo padrão de escala+grupo serve as barras por competência, o sparkline de linha e a futura "História · 12 competências" — sem repetir a mecânica de eixo em cada arquivo.

## Consequências

- **Positivas:** menos código de posicionamento escrito à mão; escalas com comportamento previsível e testado; caminho pavimentado pra #56/#59 reusarem os mesmos primitivos.
- **Negativas / aceito:** uma dependência de runtime a mais (`@visx/shape`, `@visx/scale`, `@visx/group`, `@visx/curve` — quatro pacotes, cada um pequeno); acessibilidade e estética continuam 100% escritas à mão no componente, o visx não resolve nenhuma delas — só a geometria.

## Opções rejeitadas

- **Continuar em SVG puro.** Sustentável pra uma linha simples, mas cada gráfico novo do PRD #45 (barras com 3 estados, escala de média cruzando o eixo, tooltip acessível) reimplementaria escala e posicionamento do zero — custo que só cresce a cada issue (#56, #59).
- **Chart-engine de alto nível (Recharts, Chart.js, Nivo).** Resolveria mais de uma vez, mas impõe API própria de tooltip/tema/acessibilidade — atrito pra bater com os tokens do contrato de design (`docs/design/`) e com a a11y sob medida (foco por teclado em cada barra, tabela `sr-only`) que o PRD exige. `visx` fica no meio-termo: resolve geometria, deixa markup e comportamento livres.

## Gatilhos de reabertura

- O número de gráficos crescer a ponto de a composição manual de camadas visx (em vez de uma API de alto nível) virar o gargalo, não a exceção.
- Surgir necessidade de gráfico interativo complexo (zoom, brush, múltiplas séries cruzadas) que o visx não cobre bem sem reimplementar boa parte de um chart-engine por conta própria.
