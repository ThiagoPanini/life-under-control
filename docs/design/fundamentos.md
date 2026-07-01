# Fundamentos e tokens

## Cor

| Token | Valor oficial | Uso |
|---|---:|---|
| `--luc-bg` | `#0a0c0f` | fundo da aplicação |
| `--luc-surface-1` | `#0c0f13` | painel lateral |
| `--luc-surface-2` | `#111419` | cards, header e botão secundário |
| `--luc-surface-3` | `#13161b` | command palette e modais |
| `--luc-border` | `rgba(255,255,255,.07)` | contornos |
| `--luc-border-strong` | `rgba(255,255,255,.10)` | foco e botão secundário |
| `--luc-row-line` | `rgba(255,255,255,.04)` | linhas de tabela |
| `--luc-text` | `#e7e9ec` | texto primário |
| `--luc-text-strong` | `#c9ccd1` | títulos de bloco |
| `--luc-text-2` | `#9aa0a8` | texto secundário |
| `--luc-text-3` | `#8b9099` | rótulos de campo |
| `--luc-muted` | `#6b7178` | apoio e metadados |
| `--luc-faint` | `#5f656d` | placeholder e notas |
| `--luc-disabled` | `#4f555c` | vazio e desabilitado |
| `--luc-accent` | `#4cc4e6` | ação primária, linhas e barras |
| `--luc-accent-bright` | `#8fdcf0` | ícone ativo e realce claro |
| `--luc-accent-16` | `rgba(76,196,230,.16)` | pílula e ícone ativo |
| `--luc-accent-12` | `rgba(76,196,230,.12)` | navegação ativa |
| `--luc-accent-06` | `rgba(76,196,230,.06)` | superfície ativa sutil |
| `--luc-success` | `#5fd0a0` | quitada, favorito e pronto |
| `--luc-warn` | `#e0a05f` | pendente, a vencer e `em breve` |
| `--luc-thiago-fg` | `hsl(211 76% 74%)` | frente do chip de Thiago |
| `--luc-thiago-bg` | `hsl(211 44% 23%)` | fundo do chip de Thiago |
| `--luc-jakeline-fg` | `hsl(14 76% 74%)` | frente do chip de Jakeline |
| `--luc-jakeline-bg` | `hsl(14 44% 23%)` | fundo do chip de Jakeline |

Bordas são sempre branco translúcido, nunca uma cor sólida. A paleta não ganha cores decorativas por tela. Os hexadecimais oficiais do botão Google são a única exceção de marca externa.

## Tipografia

- `--luc-font-sans`: Manrope, pesos 400, 500, 600, 700 e 800.
- `--luc-font-mono`: JetBrains Mono, pesos 400, 500 e 600.
- **Display:** Manrope 800, 34px, tracking `-.025em`.
- **Título de página:** Manrope 800, 25px, tracking `-.02em`.
- **Título de bloco:** Manrope 700. A origem conflita entre 13px no metadado e 14px na amostra; telas de referência usam 12.5–14px conforme densidade.
- **Corpo:** Manrope 500, 14px.
- **Rótulo:** Manrope 700, caixa alta, tracking `.13em`. A origem conflita entre 11px no metadado e 12px na amostra; a casca usa 10.5–12px conforme espaço.
- **Número:** JetBrains Mono 600, 24px, tracking `-.02em`.

Dinheiro, datas, percentuais, atalhos e eixos usam JetBrains Mono. Texto, títulos, botões e rótulos usam Manrope. BRL aparece como `R$ 1.234,56`; datas completas, como `01/07/2026`.

## Espaçamento, raio e ícones

- Escala-base: 4, 8, 12, 16, 24 e 32px.
- Cards: 15–18px de padding.
- Seções: 24–32px de respiro.
- `--luc-r-sm`: 7px, para pílulas e chips compactos.
- `--luc-r-md`: 9px, para controles e navegação.
- `--luc-r-lg`: 13px, para cards.
- `--luc-r-xl`: 16px, para modais e painéis destacados.
- Pílula completa: 999px, apenas quando a forma circular comunica melhor que o raio de 7px.
- Ícones: família Lucide, `viewBox="0 0 24 24"`, traço 1.7, pontas e juntas arredondadas.

## Medidas estruturais

| Token | Valor | Uso |
|---|---:|---|
| `--luc-sidebar-w` | `244px` | sidebar expandida |
| `--luc-sidebar-w-collapsed` | `74px` | rail colapsado |

Todo token deve ser consumível como variável CSS. Cores e raios também devem estar expostos no bridge do Tailwind; larguras estruturais podem ser usadas como `var(--luc-sidebar-w)` quando uma utility não trouxer clareza.
