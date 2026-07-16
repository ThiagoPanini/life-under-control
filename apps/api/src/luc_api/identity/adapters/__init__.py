"""Identity adapters layer: Postgres/Core repos over the identity ports (Seam-2, F2).

Map: `SqlHouseholdRepo` (single-Household load, ADR-0002), `SqlUserRepo`
(point reads/writes — Google/WhatsApp linking, avatar). May depend on
`application`, `domain` and `shared`; nothing upstream depends on this layer.
"""

from luc_api.identity.adapters.household_repo import SqlHouseholdRepo
from luc_api.identity.adapters.user_repo import SqlUserRepo

__all__ = ["SqlHouseholdRepo", "SqlUserRepo"]
