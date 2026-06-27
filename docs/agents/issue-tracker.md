# Issue tracker: GitHub

Issues e PRDs deste repo vivem como issues do GitHub (`ThiagoPanini/life-under-control`). Use a CLI `gh` para todas as operações — ela infere o repo a partir do `git remote`.

## Convenções

- **Criar issue**: `gh issue create --title "..." --body "..."` (heredoc para corpo multi-linha).
- **Ler issue**: `gh issue view <número> --comments`.
- **Listar issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` com `--label`/`--state` conforme o caso.
- **Comentar**: `gh issue comment <número> --body "..."`.
- **Aplicar/remover label**: `gh issue edit <número> --add-label "..."` / `--remove-label "..."`.
- **Fechar**: `gh issue close <número> --comment "..."`.

Labels seguem o padrão `família:valor` (`status:`, `type:`, `area:`, `boundary:`, `phase:`); os estados de triagem estão em `triage-labels.md`.

## Pull requests como superfície de triagem

**PRs como superfície de pedido: não.** Repo dirigido por milestones — `/triage` olha só issues, deixando PRs em andamento de colaboradores em paz. (Mude para "sim" se um dia PRs externos virarem feature requests; aí valem os equivalentes `gh pr view`/`gh pr list`/`gh pr edit`. O GitHub compartilha um único espaço de numeração entre issues e PRs, então `#42` pode ser qualquer um — resolva com `gh pr view 42` e caia para `gh issue view 42`.)

## Quando uma skill diz "publish to the issue tracker"

Crie uma issue no GitHub.

## Quando uma skill diz "fetch the relevant ticket"

Rode `gh issue view <número> --comments`.
