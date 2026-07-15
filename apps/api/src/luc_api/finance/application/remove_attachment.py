"""Use-case: remove a receipt — metadata (Household-scoped) **and** the R2 object."""

from luc_api.finance.application.attachment_repo import AttachmentRepo
from luc_api.finance.application.attachment_store import AttachmentStore

__all__ = ["remove_attachment"]


async def remove_attachment(
    store: AttachmentStore,
    repo: AttachmentRepo,
    household_id: str,
    attachment_id: str,
) -> bool:
    """Delete the metadata first (the source of truth of what exists), then the object.

    Replacing is removing and attaching again, so there is no dedicated
    use-case. If the metadata was not there (`None`), the bucket is untouched
    and `False` returns. Both Pessoas remove (symmetric access, #1).
    """
    removed = await repo.delete_attachment(household_id, attachment_id)
    if removed is None:
        return False
    await store.remove(removed.r2_key)
    return True
