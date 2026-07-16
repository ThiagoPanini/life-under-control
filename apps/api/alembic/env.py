"""Alembic environment: resolves the migration URL and targets our `MetaData`.

Standard sync Alembic — the app's runtime engine is async, but migrations don't
need to be non-blocking (see `luc_api.shared.adapters.db.migrate`), and staying
sync avoids the async-`env.py` ceremony entirely.
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from luc_api.shared.adapters.db.engine import to_sqlalchemy_url
from luc_api.shared.adapters.db.metadata import metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = metadata

if not config.get_main_option("sqlalchemy.url"):
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        config.set_main_option("sqlalchemy.url", to_sqlalchemy_url(database_url))


def run_migrations_offline() -> None:
    """Emits migration SQL against a URL only, without a live database connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Runs migrations against a live connection (the boot-time and CLI path)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
