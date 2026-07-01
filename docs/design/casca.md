# Casca, navegação e login

## Desktop

A aplicação ocupa no mínimo a viewport. Sidebar fixa à esquerda; área principal com header e conteúdo rolável.

- Sidebar expandida: 244px, rótulos visíveis.
- Sidebar colapsada: 74px, apenas ícones e pontos das Áreas ativas.
- Transição de largura: 180ms ease.
- Estado de colapso persistido localmente no navegador.
- Header: 56px, borda inferior translúcida, fundo de `--luc-bg` com transparência e blur de 8px.
- Conteúdo: padding 28px 32px 64px e largura máxima de 1120px; Agenda limita-se a 820px; página `em breve`, a 560px.
- Controle de colapso à esquerda; breadcrumb usa título forte, separador disabled e complemento secundário.
- Busca abre a command palette e anuncia `⌘K`/`Ctrl+K`.

A navegação principal contém Painel, Finanças e Agenda. A lista “ÁREAS” contém as seis Áreas e comunica `ativa` ou `em breve`; Finanças pode aparecer nas duas lentes porque a primeira é atalho operacional e a segunda mostra o mapa completo do Lar.

O rodapé da sidebar mostra os dois chips de Pessoa e “acesso simétrico”. Ao colapsar, os chips empilham e o texto desaparece.

## Responsivo — decisão derivada

O protótipo é desktop e não especifica breakpoint nem dock. A casca responsiva existente é preservada:

- sidebar desktop fica oculta abaixo de `lg`;
- header móvel mantém marca e botão de menu;
- drawer replica a hierarquia da sidebar, com overlay, Escape, retenção de foco e scroll lock;
- dock inferior mantém Painel, Agenda e acesso às Áreas, usando os estados do item de navegação;
- conteúdo reserva espaço para header e dock; nenhuma ação pode ficar encoberta;
- medidas específicas do mobile são estruturais, não novos tokens globais.

## Login

Login ocupa a viewport e usa o asset oficial do Claude Design como atmosfera:

- imagem em cover, posição `center 26%`, escala 1.08;
- `blur(5px) brightness(.5) saturate(1.12)`;
- véu radial ciano `120% 75% at 50% -8%`, accent a 15%, transparente em 55%;
- véu vertical em `--luc-bg`: opacidades .74, .56, .72 e .94 nos marcos 0%, 30%, 58% e 100%;
- conteúdo com largura máxima de 392px;
- marca Life Under Control/LUC, texto “O cockpit da vida do Lar — toda métrica à vista.”;
- card em surface-2, border, raio `--luc-r-xl`, padding 26×24px;
- botão Google branco com cores oficiais da marca;
- chips de Thiago e Jakeline;
- copy deixa explícitos duas Pessoas, ausência de cadastro e acesso simétrico.

Não existe auto-cadastro, escolha de Lar, seleção de perfil ou qualquer ocorrência do codinome interno.
