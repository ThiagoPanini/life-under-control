"""Adapter do `Clock` sobre o relógio do sistema, no fuso do Lar (America/Sao_Paulo).

Formata como data civil (YYYY-MM-DD), sem hora nem timezone vazando para o domínio.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from luc_api.shared.application.clock import Clock

_FUSO_LAR = ZoneInfo("America/Sao_Paulo")


class SystemClock:
    """`Clock` sobre o relógio do sistema, no fuso do Lar."""

    def hoje(self) -> str:
        """A data civil de hoje (YYYY-MM-DD) no fuso do Lar."""
        return datetime.now(_FUSO_LAR).date().isoformat()


def system_clock() -> Clock:
    """Monta o `Clock` do sistema no fuso do Lar."""
    return SystemClock()
