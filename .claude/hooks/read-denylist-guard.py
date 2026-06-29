#!/usr/bin/env python3
"""PreToolUse(Read) — trava de economia de contexto.

Bloqueia leitura INTEIRA de paths que nunca valem a pena durante implementação:
output cru de subagente, dumps de MCP salvos, lockfiles, snapshots gerados, artefatos.
Leitura de código-fonte fica livre (o julgamento fica a cargo do protocolo injetado).

Mecanismo: motivo em stderr + exit 2 bloqueia a chamada (forma estável, sem depender
do shape do JSON de saída).

Marker-gated: só enforça onde existe .claude/context-economy-protocol.md (opt-in),
pra permitir promover este script pro ~/.claude global sem afetar repos não-optantes.

Sem dependências externas (jq/node) — só python3 do sistema (/usr/bin/python3).
"""
import fnmatch
import json
import os
import sys

proj = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

# opt-in pelo marker; sem ele, inerte
if not os.path.isfile(os.path.join(proj, ".claude", "context-economy-protocol.md")):
    sys.exit(0)

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

path = ((data.get("tool_input") or {}).get("file_path") or "")
if not path:
    sys.exit(0)

# (glob, motivo) — paths que nunca valem inteiros durante implementação
GLOB_RULES = [
    ("*.output", "output cru de subagente — você já tem o digest/preview; não releia o .output"),
    ("*/tool-results/*", "dump salvo de resultado de MCP — o conteúdo já veio inline; re-consulte o MCP com pergunta dirigida em vez de reler o dump"),
    ("*/drizzle/meta/*", "snapshot/journal gerado do Drizzle — leia o schema.ts, não o snapshot"),
    ("*/node_modules/*", "dependência instalada — fora do código-fonte a editar"),
    ("*/dist/*", "build artifact — fora do código-fonte a editar"),
    ("*/.next/*", "build artifact do Next — fora do código-fonte a editar"),
    ("*.min.js", "arquivo minificado — fora do código-fonte a editar"),
    ("*.min.css", "arquivo minificado — fora do código-fonte a editar"),
]
LOCKFILES = {"pnpm-lock.yaml", "package-lock.json", "yarn.lock"}

reason = None
for glob, msg in GLOB_RULES:
    if fnmatch.fnmatch(path, glob):
        reason = msg
        break
if reason is None and os.path.basename(path) in LOCKFILES:
    reason = "lockfile — nunca precisa ser lido inteiro durante implementação"

if reason is None:
    sys.exit(0)

sys.stderr.write(
    f"[economia de contexto] {reason}. "
    "(trava: .claude/hooks/read-denylist-guard.py — desligue lá no caso raro de precisar do conteúdo cru)\n"
)
sys.exit(2)
