"""SQLAlchemy Core `MetaData`: the 7 tables, mirroring the schema 1:1.

The 13 raw SQL migrations under `apps/web/drizzle/` (and their Drizzle
declarative mirror, `apps/web/src/adapters/db/schema.ts`) remain the origin
of this schema and its sole DDL owner — `apps/web` still creates and evolves
these tables. This `MetaData` exists so Alembic can adopt that existing
schema as code (autogenerate diffs against it) without ever issuing its own
`CREATE TABLE` (see `migrate.py`'s baseline revision).

`whatsapp_events`/`whatsapp_proposals` are declared here even though no
`apps/api` context owns them yet (the `whatsapp` context doesn't exist) —
without them the baseline-fidelity check (autogenerate against the fully
migrated database) would see two tables missing and report a false diff.
"""

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)

__all__ = [
    "attachments",
    "bills",
    "households",
    "metadata",
    "payments",
    "users",
    "whatsapp_events",
    "whatsapp_proposals",
]

metadata = MetaData()

households = Table(
    "households",
    metadata,
    Column("id", Uuid(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("nome", Text, nullable=False),
)

users = Table(
    "users",
    metadata,
    Column("id", Uuid(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")),
    Column(
        "household_id",
        Uuid(as_uuid=False),
        ForeignKey("households.id", name="users_household_id_households_id_fk"),
        nullable=False,
    ),
    Column("email", Text, nullable=False),
    Column("nome", Text, nullable=False),
    Column("google_email", Text),
    Column("hue", Integer, nullable=False),
    Column("inicial", Text, nullable=False),
    Column("avatar_key", Text),
    Column("whatsapp_phone", Text),
    UniqueConstraint("email", name="users_email_unique"),
    Index("users_google_email_lower_unique", text("lower(google_email)"), unique=True),
    Index("users_whatsapp_phone_unique", "whatsapp_phone", unique=True),
)

bills = Table(
    "bills",
    metadata,
    Column("id", Uuid(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")),
    Column(
        "household_id",
        Uuid(as_uuid=False),
        ForeignKey("households.id", name="bills_household_id_households_id_fk"),
        nullable=False,
    ),
    Column("nome", Text, nullable=False),
    Column("descricao", Text),
    Column("icon", Text, nullable=False),
    Column("logo_key", Text),
    Column("interval_months", Integer, nullable=False),
    Column("anchor_month", Integer),
    Column("due_rule_kind", Text, nullable=False),
    Column("due_rule_day", Integer),
    Column("due_rule_nth", Integer),
    Column("due_month_offset", Integer, nullable=False, server_default=text("0")),
    Column("primeira_competencia", Text, nullable=False),
    Column("estado", Text, nullable=False, server_default=text("'ativa'")),
    Column("encerrada_em", Date),
    CheckConstraint("estado in ('ativa', 'encerrada')", name="bills_estado_check"),
    CheckConstraint(
        "(estado = 'encerrada') = (encerrada_em is not null)",
        name="bills_encerramento_check",
    ),
    CheckConstraint(
        "due_rule_kind in ('dia-fixo', 'n-esimo-dia-util', 'ultimo-dia-util')",
        name="bills_due_rule_kind_check",
    ),
    CheckConstraint("interval_months >= 1", name="bills_interval_months_check"),
    CheckConstraint("due_month_offset >= 0", name="bills_due_month_offset_check"),
    CheckConstraint(
        "primeira_competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'",
        name="bills_primeira_competencia_check",
    ),
    CheckConstraint(
        "(interval_months = 1 and anchor_month is null)"
        " or (interval_months > 1 and anchor_month between 1 and 12)",
        name="bills_recurrence_anchor_check",
    ),
    CheckConstraint(
        "(due_rule_kind = 'dia-fixo') = (due_rule_day is not null)"
        " and (due_rule_kind = 'n-esimo-dia-util') = (due_rule_nth is not null)"
        " and (due_rule_day is null or due_rule_day between 1 and 31)"
        " and (due_rule_nth is null or due_rule_nth between 1 and 23)",
        name="bills_due_rule_shape_check",
    ),
)

payments = Table(
    "payments",
    metadata,
    Column("id", Uuid(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")),
    Column(
        "household_id",
        Uuid(as_uuid=False),
        ForeignKey("households.id", name="payments_household_id_households_id_fk"),
        nullable=False,
    ),
    Column(
        "bill_id",
        Uuid(as_uuid=False),
        ForeignKey("bills.id", name="payments_bill_id_bills_id_fk", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("valor", BigInteger, nullable=False),
    Column("data_pagamento", Date),
    Column("competencia", Text, nullable=False),
    Column(
        "paid_by",
        Uuid(as_uuid=False),
        ForeignKey("users.id", name="payments_paid_by_users_id_fk"),
        nullable=False,
    ),
    CheckConstraint("valor > 0", name="payments_valor_check"),
    CheckConstraint(
        "competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'",
        name="payments_competencia_check",
    ),
)

attachments = Table(
    "attachments",
    metadata,
    Column("id", Uuid(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")),
    Column(
        "household_id",
        Uuid(as_uuid=False),
        ForeignKey("households.id", name="attachments_household_id_households_id_fk"),
        nullable=False,
    ),
    Column(
        "payment_id",
        Uuid(as_uuid=False),
        ForeignKey("payments.id", name="attachments_payment_id_payments_id_fk", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("nome_original", Text, nullable=False),
    Column("tipo_mime", Text, nullable=False),
    Column("tamanho_bytes", BigInteger, nullable=False),
    Column("chave_r2", Text, nullable=False),
    Column(
        "uploaded_by",
        Uuid(as_uuid=False),
        ForeignKey("users.id", name="attachments_uploaded_by_users_id_fk"),
        nullable=False,
    ),
    Column(
        "criado_em",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    ),
    UniqueConstraint("chave_r2", name="attachments_chave_r2_unique"),
    CheckConstraint("tamanho_bytes > 0", name="attachments_tamanho_check"),
    CheckConstraint(
        "tipo_mime = 'application/pdf'"
        " or (tipo_mime like 'image/%' and tipo_mime <> 'image/svg+xml')",
        name="attachments_tipo_check",
    ),
)

whatsapp_events = Table(
    "whatsapp_events",
    metadata,
    Column("id", Uuid(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("wa_message_id", Text, nullable=False),
    Column("remetente", Text, nullable=False),
    Column(
        "criado_em",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    ),
    UniqueConstraint("wa_message_id", name="whatsapp_events_wa_message_id_unique"),
)

whatsapp_proposals = Table(
    "whatsapp_proposals",
    metadata,
    Column("id", Uuid(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")),
    Column(
        "household_id",
        Uuid(as_uuid=False),
        ForeignKey("households.id", name="whatsapp_proposals_household_id_households_id_fk"),
        nullable=False,
    ),
    Column("wa_message_id", Text, nullable=False),
    Column("bytes_hash", Text, nullable=False),
    Column(
        "paid_by",
        Uuid(as_uuid=False),
        ForeignKey("users.id", name="whatsapp_proposals_paid_by_users_id_fk"),
        nullable=False,
    ),
    Column(
        "bill_id",
        Uuid(as_uuid=False),
        ForeignKey("bills.id", name="whatsapp_proposals_bill_id_bills_id_fk", ondelete="SET NULL"),
    ),
    Column("valor_centavos", BigInteger),
    Column("data_pagamento", Date),
    Column("competencia", Text),
    Column("favorecido", Text),
    Column("staging_key", Text, nullable=False),
    Column("tipo_mime", Text, nullable=False),
    Column("estado", Text, nullable=False, server_default=text("'proposta'")),
    Column(
        "criado_em",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    ),
    Column("aguardando_campo", Text),
    Column(
        "aguardando_por",
        Uuid(as_uuid=False),
        ForeignKey(
            "users.id", name="whatsapp_proposals_aguardando_por_users_id_fk", ondelete="SET NULL"
        ),
    ),
    CheckConstraint(
        "estado in ('proposta', 'confirmada', 'cancelada', 'expirada')",
        name="whatsapp_proposals_estado_check",
    ),
    CheckConstraint(
        "valor_centavos is null or valor_centavos > 0",
        name="whatsapp_proposals_valor_check",
    ),
    CheckConstraint(
        "competencia is null or competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'",
        name="whatsapp_proposals_competencia_check",
    ),
    CheckConstraint(
        "aguardando_campo is null or aguardando_campo in ('valor', 'data', 'favorecido')",
        name="whatsapp_proposals_aguardando_check",
    ),
    Index(
        "whatsapp_proposals_hash_ativo_uidx",
        "household_id",
        "bytes_hash",
        unique=True,
        postgresql_where=text("estado in ('proposta', 'confirmada')"),
    ),
)
