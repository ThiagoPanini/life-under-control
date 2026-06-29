# Protocolo de economia de contexto — implementação

> Injetado pelo hook `UserPromptSubmit` quando uma implementação começa. Também é o **marker** de opt-in: enquanto este arquivo existir, os hooks de economia de contexto do repo ficam ativos (sem ele, são inertes — o que permite promover os scripts pro `~/.claude` global).

Você está iniciando implementação. A meta é chegar ao primeiro teste RED com a janela perto do baseline, não em 100k+. **Antes de ler o repositório você mesmo:**

1. **Delegue o reconhecimento a um subagente `Explore`**, com escopo na Área tocada. Peça um digest enxuto (≤2-3k), schema fixo: arquivos relevantes (path + por que importam), padrão a espelhar (o vizinho já implementado mais próximo), invariantes/ADR aplicáveis, seams para TDD (onde o teste RED encosta). No modo autônomo ("implementa as issues"): um `Explore` por issue.
2. **Aja só sobre o digest.** Leia apenas os arquivos que o digest nomeia, em fatias estreitas (`offset`/`limit`), o suficiente pro RED. O digest é seu **orçamento de leitura** — não releia a árvore nem explore além dele.
3. **Issue enxuta.** Só a issue-alvo (`gh issue view N`, campos title/body/labels). Sem issues irmãs, sem `--comments` salvo necessidade real.
4. **Nunca releia output cru.** `.output` de subagente e dumps de `tool-results/` de MCP já viraram digest/preview — não os releia (a trava de Read bloqueia). Precisa do conteúdo? Re-consulte a fonte com pergunta dirigida.

Por quê: medições de `/implement` reais mostraram a janela chegando a 92-160k no primeiro código — 15-28k disso em Reads de arquivo inteiro evitáveis, uma vez **mesmo com um digest de 191 tokens já em mãos**. Delegar **e então obedecer ao digest** é o conserto.
