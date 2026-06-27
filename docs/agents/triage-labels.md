# Labels de triagem

As skills falam em cinco papéis canônicos de triagem. Este repo usa o namespace `status:` para estados de workflow, então cada papel mapeia para a label `status:*` correspondente.

| Papel canônico (skills) | Label no repo | Significado |
| ----------------------- | ----------------------- | --------------------------------------------------- |
| `needs-triage`          | `status:needs-triage`   | Mantenedor precisa avaliar a issue |
| `needs-info`            | `status:needs-info`     | Esperando informação do autor/reporter |
| `ready-for-agent`       | `status:ready-for-agent`| Especificada, pronta para um agente AFK pegar |
| `ready-for-human`       | `status:hitl`           | Requer o operador num dos 4 casos da fronteira de autonomia (segredo de terceiro, lock-out/acesso, recriar substrato, tocar outro projeto) |
| `wontfix`               | `status:wontfix`        | Não será implementada |

Quando uma skill cita um papel (ex.: "aplique a label de pronto-para-AFK"), use a string da coluna do meio.

A fronteira AFK↔HITL é de **capacidade/acesso, não de reversibilidade**: DNS (Cloudflare MCP), deploy/produção e segredo auto-gerável são AFK; só os 4 casos viram `status:hitl`. Ver [ADR-0007](../adr/0007-autonomia-total-do-agente.md).

`status:blocked` (bloqueada por dependência/borda externa) é um estado de workflow ortogonal — não faz parte da máquina de triagem de entrada, mas convive no mesmo namespace.

As demais famílias (`type:`, `area:`, `boundary:`, `phase:`) classificam tipo de mudança, área de código, boundary de domínio e fase — são ortogonais à triagem e as skills não as substituem.
