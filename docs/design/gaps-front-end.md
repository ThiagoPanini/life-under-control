# Relatório de gaps do front-end

Auditoria feita em 01/07/2026 contra o contrato oficial e o protótipo. Prioridade: **P0** bloqueia consistência sistêmica; **P1** afeta a casca ou leitura principal; **P2** afeta telas operacionais e acabamento.

## P0 — contrato e fundação

| Onde | Divergência | O design manda | Fix |
|---|---|---|---|
| `CLAUDE.md` | contrato visual ainda era futuro | contrato vivo versionado | apontar para `docs/design/` |
| `apps/web/src/app/globals.css` | bridge omite row-line, accent-06/12/16 e cores de Pessoa | todo token consumível | expor todos os tokens de cor e autoria; documentar larguras estruturais |
| `components/ds/` | só Button, Pill e AreaCard; padrões repetidos ficam ad-hoc | biblioteca comum de blocos | criar primitivas de métrica, tendência, Pessoa, campo, superfície e estado |
| testes de UI | não verificam variantes e estados do DS | contrato vivo protegido | testar variantes, disabled, focus semântico, `em breve` e autoria |

## P1 — casca, marca e telas principais

| Onde | Divergência | O design manda | Fix |
|---|---|---|---|
| `components/ds/Button.tsx` | faltam variante secundária e aparência disabled; `Link` perde props | primário/secundário/fantasma e estados comuns | completar API, estados e encaminhamento de props |
| `components/ds/Pill.tsx` | tones neutral/muted/accent não cobrem success, warn e estados | mapa oficial de pílulas | substituir por variantes semânticas e labels explícitos |
| `components/PersonChip.tsx` | HSL recalculado a partir de hue | combinações nominais fixas | consumir tokens Thiago/Jakeline |
| `components/brand/Logo.tsx` | marca precisa ser conferida contra símbolo e wordmark oficiais | símbolo circular + Life Under Control/LUC | alinhar tamanhos, borda e copy; remover codinome de qualquer saída |
| `components/shell/AppShell.tsx` | valores soltos de overlay, sombras e medidas; colapso persiste em cookie | 244↔74, tokens e estado local | alinhar desktop, persistir colapso localmente e trocar cores soltas por contrato |
| `components/shell/AppShell.tsx` | não há command palette `Ctrl/⌘+K` | busca global da casca | implementar diálogo acessível apenas com destinos existentes |
| `components/shell/AppShell.tsx` | mobile não existe na origem visual | decisão do operador: preservar função com a mesma linguagem | manter drawer/dock, aplicar tokens e estados do item de navegação |
| `app/login/page.tsx` e `public/login-background.webp` | asset 1440×810 e tratamento `scale-105`/blur 8px divergem | asset oficial, escala 1.08, blur 5px, posição 26% e véus exatos | incorporar PNG oficial e reproduzir composição/copy |
| `app/login/page.tsx` | card e botão Google são ad-hoc | card e botão conforme contrato; hex Google permitido | mover estrutura comum para DS sem alterar OAuth |
| `app/(app)/painel/page.tsx` | mostra Lar/Pessoas e grid, sem abertura instrumental completa | data, título, KPIs/tendência e Áreas | compor leituras reais de Finanças; omitir métricas das Áreas `em breve` |
| `components/ds/AreaCard.tsx` | selo e cores não cobrem todos os estados oficiais | ativa com métrica; `em breve` com resumo | alinhar fundo, borda, ícone e pílula |
| `app/(app)/agenda/page.tsx` | lista ad-hoc | grupos temporais, mono para data/valor, estado e autoria | extrair linha/grupo DS e alinhar densidade |
| `app/(app)/areas/[slug]/page.tsx` | composição precisa convergir para o alvo | ícone 72px, pílula, título, explicação honesta e volta | alinhar largura, espaçamento, copy e botão secundário |

## P1 — Finanças

| Onde | Divergência | O design manda | Fix |
|---|---|---|---|
| `components/financas/BillCard.tsx` | exibe só nome, descrição, recorrência e vencimento; ainda anuncia trabalho futuro | card com farol, grid 12, média e sparkline | integrar `derivarCardConta`, já implementado e testado |
| `core/use-cases/derive-bill-card.ts` + UI | estados existem no domínio, sem representação visual | farol e grid legíveis sem depender só de cor | mapear os quatro faróis e seis células conforme catálogo |
| `components/financas/CockpitFinancas.tsx` | métricas ad-hoc | cards KPI e tendência comuns | migrar para primitivas DS e escala tipográfica oficial |
| `app/(app)/areas/financas/page.tsx` | visão atual não reproduz faixa de métricas, tendência e leitura densa de Contas | cockpit instrumental | reordenar composição e manter ativas/encerradas sem perder função |
| `components/financas/LancamentosLista.tsx` | tabela/lista ad-hoc | row-line, valores/datas mono, autoria nominal | migrar linha, vazio e cabeçalho para DS |

## P2 — formulários, detalhe e acabamento

| Onde | Divergência | O design manda | Fix |
|---|---|---|---|
| `components/financas/form-field.tsx` | base parcial, sem catálogo oficial | Field/Input/Select derivados | promover para `components/ds/` e centralizar estados |
| `components/financas/BillForm.tsx` | radios, icon picker, wizard e opacidades ad-hoc | padrões ativos da navegação, focus e disabled comuns | migrar controles sem alterar etapas ou payload |
| `components/financas/PaymentForm.tsx` | campos e pending não compartilham estados visuais | controles DS, `aria-busy` e copy pt-BR | migrar mantendo centavos, ISO e aviso não bloqueante |
| `components/financas/DangerZone.tsx` | input repetido e fundo `warn` arbitrário | ação destrutiva âmbar, confirmação explícita | reutilizar Field/Button e intensidade documentada |
| `app/(app)/areas/financas/[id]/page.tsx` | detalhe, baixa e anexos não têm tela no protótipo | decisão do operador: aplicar contrato sem mudar função | uniformizar headers, superfícies, linhas, autoria e estados |
| `app/(app)/areas/financas/nova/page.tsx` e `[id]/editar/page.tsx` | wrappers e títulos repetidos | mesma casca e escala de página | extrair PageHeader/Surface e alinhar espaçamento |
| `app/layout.tsx` | `themeColor` repete hex oficial | token é fonte única em CSS; metadata exige valor estático | manter valor estático documentado como limitação da API, sem criar outra cor |
| várias telas/componentes | tamanhos 9–13px, tracking e opacidades arbitrários | escala e tokens oficiais | substituir quando houver papel equivalente; manter só medidas contextuais registradas |
| várias telas/componentes | states pending/disabled são principalmente texto | estado visual comum e semântica nativa | aplicar disabled/aria-disabled/aria-busy de forma uniforme |

## Escopo sinalizado e resolvido

| Divergência | Decisão do operador |
|---|---|
| protótipo mostra Gastronomia e Supermercado ativas | não construir; Finanças segue única ativa |
| protótipo não cobre formulários e detalhes | preservar função e aplicar os fundamentos/componentes mais próximos |
| protótipo não cobre mobile | preservar drawer/dock existentes e alinhar sua linguagem à casca |
| protótipo não define hover/focus/disabled | usar os estados acessíveis derivados no catálogo |

## Resultado da remediação

Todos os gaps listados acima foram tratados em 01/07/2026. Itens em que a origem visual era silente seguiram as decisões explícitas do operador, sem ativar novas Áreas nem alterar payloads ou regras de domínio.

| Conjunto | Situação | Evidência principal |
|---|---|---|
| contrato, princípios, tokens, casca e vocabulário | corrigido | `docs/design/`, `CLAUDE.md` |
| bridge Tailwind e estados básicos | corrigido | `globals.css`, `Button`, `Pill`, `FormField` |
| autoria por Pessoa | corrigido | tokens Thiago/Jakeline e `PersonChip` |
| sidebar 244↔74, header, nav, command palette e mobile | corrigido | `AppShell` |
| login e asset de fundo | corrigido | `login/page.tsx`, `login-background.png` oficial |
| Painel, Agenda e páginas `em breve` | corrigido | rotas correspondentes e componentes DS |
| cockpit e tendência de Finanças | corrigido | `CockpitFinancas`, `TrendCard`, `serieTotalPago` |
| farol, grid de 12 ocorrências, média e sparkline | corrigido | `BillCard` consumindo `derivarCardConta` |
| detalhe, Lançamentos e anexos | corrigido | rota de Conta, `LancamentosLista`, `ComprovantesLancamento` |
| formulários, pending, disabled, erro e zona de risco | corrigido | `FormField`, `BillForm`, `PaymentForm`, `DangerZone` |

Validação local final: Biome em 146 arquivos, TypeScript sem erros e 246 testes aprovados; 31 testes de adapters dependentes de infraestrutura permaneceram corretamente ignorados pela configuração da suíte.
