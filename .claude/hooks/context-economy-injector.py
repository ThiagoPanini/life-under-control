#!/usr/bin/env python3
"""UserPromptSubmit — injetor de economia de contexto.

Quando uma implementação começa (/implement ou "implementa as issues"), injeta o
protocolo (.claude/context-economy-protocol.md) no contexto do turno via stdout:
delegar reconhecimento a um subagente Explore, tratar o digest como orçamento de
leitura, issue enxuta, não reler output cru.

Mecanismo: para UserPromptSubmit, stdout em exit 0 é adicionado ao contexto do turno
(forma estável, sem depender do shape do JSON de saída).

Marker-gated: o protocolo É o marker; sem o arquivo, o hook é inerte (opt-in,
promovível ao ~/.claude global sem afetar repos não-optantes).

Sem dependências externas (jq/node) — só python3 do sistema (/usr/bin/python3).
"""
import json
import os
import sys

proj = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
protocol = os.path.join(proj, ".claude", "context-economy-protocol.md")

# opt-in pelo marker; sem ele, inerte
if not os.path.isfile(protocol):
    sys.exit(0)

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

prompt = (data.get("prompt") or "")

# gatilho: skill /implement ou o modo autônomo pt-BR
triggers = ("/implement", "implementa as issues", "implemente as issues")
if not any(t in prompt for t in triggers):
    sys.exit(0)

with open(protocol, "r", encoding="utf-8") as f:
    sys.stdout.write(f.read())
sys.exit(0)
