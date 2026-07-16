"""Postgres/Core persistence base (F2, ADR-0014): schema, engine and boot migration.

Map: `metadata` (the `MetaData` mirroring the 7 tables — the Alembic autogenerate
source of truth); `make_async_engine`/`to_sqlalchemy_url` (the shared async engine
factory every context's repos build on); `migrate_on_boot`/`load_config` (the
advisory-lock-guarded `alembic upgrade head` run at container boot).
"""

from luc_api.shared.adapters.db.engine import make_async_engine, to_sqlalchemy_url
from luc_api.shared.adapters.db.metadata import metadata
from luc_api.shared.adapters.db.migrate import load_config, migrate_on_boot

__all__ = [
    "load_config",
    "make_async_engine",
    "metadata",
    "migrate_on_boot",
    "to_sqlalchemy_url",
]
