# Catálogo de componentes

## Estados interativos comuns

Os exemplos de origem mostram o estado-base. O operador autorizou os estados derivados abaixo para todos os controles:

- **hover:** aumenta contraste dentro da mesma família de token; superfícies neutras usam `--luc-border-strong`, e ação primária usa `--luc-accent-bright` sem trocar a cor de texto;
- **focus-visible:** anel de 2px em `--luc-accent`, offset de 2px contra `--luc-bg`; foco nunca depende apenas da mudança de fundo;
- **active:** deslocamento visual máximo de 1px ou leve redução de luminosidade, sem animação longa;
- **disabled:** `--luc-disabled` para texto/ícone, superfície neutra, sem hover/active e cursor `not-allowed`; o estado nativo `disabled` ou `aria-disabled` é obrigatório;
- transições duram de 140 a 180ms e respeitam `prefers-reduced-motion`.

## Botão

| Variante | Fundo | Texto | Borda |
|---|---|---|---|
| primário | `--luc-accent` | `--luc-bg` | nenhuma |
| secundário | `--luc-surface-2` | `--luc-text` | `--luc-border-strong` |
| fantasma | transparente | `--luc-text-2` | nenhuma |

Altura resulta de 11–13px de padding vertical; raio 11px é o valor contextual do protótipo. Fonte Manrope 600–700, 13.5–14.5px. Ícone e rótulo têm gap de 8–10px.

## Métrica

Card em `--luc-surface-2`, borda `--luc-border`, raio `--luc-r-lg`, padding 15×16px. Ordem fixa: rótulo 11.5px em `--luc-text-3`; número mono 23–24px; apoio 11px em `--luc-muted`. O número pode usar accent, success ou warn quando o estado exigir.

## Tendência

Card de leitura com valor mono, delta textual e sparkline. Linha ciano de 2.2–2.4px, pontas arredondadas e área que desvanece de accent translúcido para transparente. Alta usa warn e queda usa success quando a métrica é gasto. Eixo usa mono 10.5px.

## Barra de leitura

Rótulo à esquerda, trilho branco a 5% com 6–8px de altura, preenchimento `--luc-accent` e valor mono à direita. A largura é proporcional ao maior valor da série e nunca comunica o total sem o número textual.

## Pílula de estado

Fonte 10–11px, peso 600–700, padding 2–4×7–10px, raio `--luc-r-sm`.

| Estado | Frente | Fundo | Borda |
|---|---|---|---|
| quitada / pronto | success | success a 12% | transparente ou success a 25% |
| pendente / quero ir | warn | warn a 12% | transparente |
| a vencer / já fui | text-2 | branco a 6% | transparente |
| favorito | accent-bright | accent-16 | transparente |
| `em breve` | warn | warn a 10% | warn a 20% |

## Chip de Pessoa

Autoria usa inicial, nunca avatar genérico ou controle de permissão. Tamanhos oficiais observados: 23–27px em linhas densas e 34px em destaque. Raio de 6–9px. As combinações são fixas em `--luc-thiago-*` e `--luc-jakeline-*`.

## Item de navegação

Altura aproximada de 36px, raio `--luc-r-md`, ícone 15–17px. Ativo usa `--luc-accent-12`, texto primário e barra ciano de 2.5px na borda esquerda. Inativo usa texto terciário. Área ativa recebe ponto success; Área inativa recebe `em breve`. No rail de 74px, permanece só o ícone e o ponto de estado.

## Cartão de Área

- **ativa:** `--luc-accent-06`, borda ciano translúcida, ícone em accent-bright sobre accent translúcido, selo success e uma métrica real;
- **`em breve`:** `--luc-surface-2`, `--luc-border`, ícone neutro, resumo sem métrica e selo explícito `em breve`;
- ambos podem navegar: a Área ativa abre sua operação; `em breve` abre apenas a página honesta de indisponibilidade.

## Linha e card de Conta

A linha densa apresenta Conta, vencimento derivado, estado, valor real ou travessão e autoria. Linhas usam `--luc-row-line`; dinheiro e datas usam mono.

O card completo reúne nome e regra, farol vigente, grid das últimas 12 ocorrências, média e sparkline. A semântica vem de `derivarCardConta`; a UI não recalcula domínio.

| Farol interno | Leitura na UI | Tratamento acessível |
|---|---|---|
| verde | quitada | success, ponto preenchido e texto |
| cinza | aguardando | text-3, ponto neutro e texto |
| amarelo | vence em até 3 dias | warn, ponto contornado e texto |
| vermelho | vence hoje ou está atrasada | warn em maior contraste, ponto preenchido com anel e texto explícito |

O grid distingue `em-dia`, `atraso-leve`, `atraso`, `em-aberto`, `aguardando` e `pago-sem-data` por forma, intensidade e texto acessível; nunca apenas por cor.

### Panorama do mês vigente — estados (#93)

O Panorama de Contas deriva de `derivarPanoramaMensal` uma leitura única por Conta com ocorrência vigente; a UI não recalcula domínio. São quatro estados, e só `vencida` veste `danger` (vermelho) — `vence em breve` é atenção (âmbar).

| Estado | Regra derivada | Cor | Tratamento acessível |
|---|---|---|---|
| `pago` | há Lançamento na Competência (prevalece); o valor é a soma das baixas fracionadas | success | ponto sólido, card apagado no repouso e rótulo |
| `a vencer` | vencimento a cinco dias ou mais | text-3 neutro | ponto sólido neutro e rótulo |
| `vence em breve` | vencimento entre hoje e quatro dias (`vence hoje` incluso) | warn | ponto sólido e rótulo |
| `vencida` | vencimento já passou — `vence hoje` nunca é atraso consumado | danger | ponto sólido e rótulo explícito |

A pílula é a mesma composição em todos os estados — borda no próprio tom (32%), fundo a 9% e **ponto sólido**; a distinção acessível vem do rótulo textual sempre presente, nunca da forma do ponto (protótipo Final; ver reconciliação do farol na camada-app).

O valor acompanha o estado: soma exata quando `pago`, `≈ média` **sem centavos** quando em aberto com histórico (estimativa não finge fato), e `—` (ausência explícita) sem base — nunca `R$ 0,00` inventado.

O card `pago` repousa **atenuado** (opacidade .62 + dessaturação, protótipo Final) e recupera contraste pleno no hover; a atenuação nunca é o único sinal — a pílula e o rótulo textual do estado permanecem presentes mesmo em repouso. Se a legibilidade do repouso incomodar em tela real, o ajuste é decisão do operador (nota de acessibilidade da rodada de fidelidade, issue #103).

### Visão Analítica por Conta (#127)

A última seção do cockpit de Pagamentos Recorrentes fecha o ciclo (Análise do mês, Análise Histórica, Mapa do Ano) com uma tabela real: uma linha por Conta, derivada por `derivarVisaoAnaliticaContas` a partir da **ocorrência vigente** de cada Conta (a mais recente até hoje — recorrência-ciente, não o mês civil); a UI não recalcula domínio. O cabeçalho espelha o Mapa do Ano — heading destaque "Visão Analítica por Conta" com chip de ícone; dentro do card, o título `DETALHES DAS CONTAS`, o subtítulo "Visão detalhada de cada conta registrada" e o switch **Incluir encerradas** (padrão desligado, só aparece quando há encerradas). A seção some quando o Lar não tem Conta registrada.

As Contas ativas vêm na **mesma ordem de urgência do Panorama** (rank de `derivarPanoramaMensal`: vencida na frente, paga no fim); as encerradas, só com o switch ligado, vão ao fim (encerramento mais recente na frente), atenuadas.

| Coluna | Regra derivada | Tratamento acessível |
|---|---|---|
| Identificação | nome (link para o detalhe) + vencimento descrito abaixo | texto; foco visível no link |
| Sinaleiro | as últimas 12 ocorrências no vocabulário do grid do card + `fora-vigência` vazio à esquerda para Conta jovem (#126) | célula focável com rótulo Competência · estado · data da baixa; forma e texto, nunca só cor |
| Pontualidade 12 | percentual em dia de `detalharPontualidadeDaConta` | número + tooltip `N/M no prazo`, focável |
| Sparkline | valores pagos da mesma janela de 12; a linha **quebra na lacuna** (ausência nunca vira zero) | ponto focável com tooltip Competência · valor, na linguagem do Total Pago por Mês; `aria-label` resume a série |
| Média 12 | média dos valores pagos da janela | mono; `—` sem histórico |
| Valor | soma das baixas quando a ocorrência vigente está paga; `≈ média` (estimado) quando em aberto; `—` sem base | mono; rótulo `estimado` textual, nunca `R$ 0,00` inventado |
| Status | a **mesma pílula** de estado do mês do Panorama — fonte única `ESTADO_MES`, sem mapa de apresentação duplicado | pílula com ponto sólido + rótulo; encerrada troca a pílula por badge `encerrada` |
| Registrar | abre o modal existente com a Competência da ocorrência vigente | some quando pago ou encerrada |

Sinaleiro e sparkline usam a **mesma janela** de 12 ocorrências e concordam célula a célula. Os tooltips são um único elemento `position: fixed` (linguagem do Mapa do Ano), com foco de teclado e hover independentes, escapando o `overflow` do scroll sem recorte. No celular a tabela rola na horizontal com a coluna de identificação fixa e legível. Nenhum estado é comunicado só por cor; a linha encerrada soma opacidade reduzida + badge + traço no valor, nunca a atenuação sozinha.

## Modal compacto (`narrow`)

Cartão de gesto curto do protótipo Final (edição rápida de Conta, Registrar Lançamento em contexto). Difere da casca clássica de modal e **não** vira tela cheia no mobile:

- painel central **com margem em toda largura** (20px), máx. 400px, raio `--luc-r-xl`, `--luc-surface-3`, borda strong, sombra profunda; altura máx. `100dvh - 40px` com corpo rolável;
- overlay `--luc-bg` a 70% com blur leve (3px); entrada com leve *pop*;
- header sem divisória: eyebrow Manrope 11px caixa alta tracking `.13em` em text-3; chip 28px raio 8 em accent-12 (logo da Conta ou ícone do catálogo — ver `BillHeaderChip`); título 14.5px bold; contexto **mono 10.5px** em muted (ex.: `competência julho de 2026 · vence em 3 dias`); X 32px raio 7;
- campos 38px raio 9, borda strong, fundo branco a 3%; rótulos no eyebrow de campo (11px caixa alta text-3); erro veste warn na borda do próprio campo;
- seleção (segmentos, grade de ícones, Pago por) veste `--luc-accent-06` + borda accent a 45%; grade de ícones 36px raio 9;
- CTA de anexo tracejado com clipe ("Anexar comprovantes · imagem ou PDF"); chips de arquivo com borda accent a 32% sobre accent-06;
- rodapé com um **primário de largura cheia** (ou primário flex + secundário estreito quando há Cancelar);
- Escape e clique no overlay são **descartes silenciosos**: uma operação em andamento os trava (`travado`); o X rotulado segue sendo a saída deliberada;
- a grade de ícones fica **sempre visível**, mesmo com logo — o ícone é o fallback persistido e o mock não dita comportamento (decisão derivada, 04/07/2026).

## Command palette

Overlay escuro com blur leve. Painel em `--luc-surface-3`, borda strong, raio 13–15px, sombra profunda. Abre por `Ctrl/⌘+K`, fecha por Escape e clique no overlay, prende foco enquanto aberta e lista apenas destinos existentes. Placeholder: “Ir para…”.

## Formulários — decisão derivada

O protótipo não define formulários. Para telas existentes:

- `Field` compõe label em `--luc-text-3`, controle e mensagem de apoio/erro;
- `Input`, `Select` e `Textarea` usam surface-1/2, border, raio `--luc-r-md`, texto primário e placeholder faint;
- foco segue o estado comum; erro usa warn, mensagem textual e `aria-describedby`;
- radios e seletores de ícone usam o mesmo padrão ativo da navegação;
- wizard mostra etapa atual com accent e etapas concluídas com success;
- ações destrutivas usam `danger` (vermelho), linguagem explícita e confirmação — o mesmo semântico do vencimento consumado, reservado a perigo e destruição;
- pending desabilita submissão, mantém o rótulo legível e expõe `aria-busy` quando aplicável.
