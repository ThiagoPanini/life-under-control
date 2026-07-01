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

## Command palette

Overlay escuro com blur leve. Painel em `--luc-surface-3`, borda strong, raio 13–15px, sombra profunda. Abre por `Ctrl/⌘+K`, fecha por Escape e clique no overlay, prende foco enquanto aberta e lista apenas destinos existentes. Placeholder: “Ir para…”.

## Formulários — decisão derivada

O protótipo não define formulários. Para telas existentes:

- `Field` compõe label em `--luc-text-3`, controle e mensagem de apoio/erro;
- `Input`, `Select` e `Textarea` usam surface-1/2, border, raio `--luc-r-md`, texto primário e placeholder faint;
- foco segue o estado comum; erro usa warn, mensagem textual e `aria-describedby`;
- radios e seletores de ícone usam o mesmo padrão ativo da navegação;
- wizard mostra etapa atual com accent e etapas concluídas com success;
- ações destrutivas usam warn, linguagem explícita e confirmação; não introduzem vermelho fora da paleta;
- pending desabilita submissão, mantém o rótulo legível e expõe `aria-busy` quando aplicável.
