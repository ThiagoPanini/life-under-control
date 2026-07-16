"""baseline: schema inherited from the 13 raw SQL migrations of the TS backend.

Revision ID: baseline
Revises:
Create Date: 2026-07-15
"""

from collections.abc import Sequence

revision: str = "baseline"
down_revision: str | Sequence[str] | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """No-op: the 7 tables already exist — `apps/web`'s Drizzle migrations own their creation."""


def downgrade() -> None:
    """No-op: baseline is the root of history; there is nothing before it to revert to."""
