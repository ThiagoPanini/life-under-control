"""Port do relógio (ADR-0003): o domínio trabalha em datas civis, não timestamps (#3).

Injetar o relógio torna "hoje" determinístico no teste (FixedClock) e fixa o fuso
do Lar (America/Sao_Paulo) num só lugar, no adapter real.
"""

from dataclasses import dataclass
from typing import Protocol


class Clock(Protocol):
    """Relógio do domínio — devolve a data civil de hoje no fuso do Lar."""

    def hoje(self) -> str:
        """A data civil de hoje (YYYY-MM-DD) no fuso do domínio."""
        ...


@dataclass(frozen=True)
class FixedClock:
    """Duplo determinístico do `Clock` para teste: devolve sempre a data injetada."""

    hoje_iso: str

    def hoje(self) -> str:
        """A data civil fixa deste relógio (YYYY-MM-DD)."""
        return self.hoje_iso
