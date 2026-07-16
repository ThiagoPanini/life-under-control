"""AttachmentStore port: the R2 object storage of receipts (ADR-0008).

The handmade in-memory fake ships beside the Protocol so every suite drives the
same double; its `keys()` inspector is fake-only, not part of the port.
"""

from dataclasses import dataclass
from typing import Protocol
from urllib.parse import quote

__all__ = ["AttachmentStore", "FakeAttachmentStore", "FakeStoredObject", "StoredObjectMeta"]


@dataclass(frozen=True)
class StoredObjectMeta:
    """What the store observed about an uploaded object — real bytes, not the client's promise."""

    size_bytes: int
    mime_type: str


class AttachmentStore(Protocol):
    """Object-storage port for receipts; adapters implement it, use-cases depend on it."""

    async def upload_url(self, key: str, mime_type: str) -> str:
        """Sign a PUT URL for the browser to upload the object directly."""
        ...

    async def put(self, key: str, content: bytes, mime_type: str) -> None:
        """Upload bytes server-side (the backfill path, no browser involved)."""
        ...

    async def read_url(self, key: str) -> str:
        """Sign a GET URL to view/download the object."""
        ...

    async def metadata(self, key: str) -> StoredObjectMeta | None:
        """Read the real size/type of the stored object; `None` when it does not exist."""
        ...

    async def remove(self, key: str) -> None:
        """Delete the object; silent when it does not exist."""
        ...

    async def copy(self, source: str, destination: str) -> None:
        """Copy an object to a new key; silent when the source does not exist."""
        ...


@dataclass(frozen=True, kw_only=True)
class FakeStoredObject:
    """Seed of the fake bucket: an object pretended to be already uploaded."""

    key: str
    size_bytes: int
    mime_type: str


class FakeAttachmentStore:
    """In-memory "bucket" — the test double of the port, plus a `keys()` inspector."""

    def __init__(self, seed: list[FakeStoredObject] | None = None) -> None:
        """Seed the bucket with objects pretended to be already uploaded."""
        self._bucket: dict[str, StoredObjectMeta] = {
            o.key: StoredObjectMeta(size_bytes=o.size_bytes, mime_type=o.mime_type)
            for o in (seed or [])
        }

    async def upload_url(self, key: str, mime_type: str) -> str:
        """Deterministic fake PUT URL carrying key and type."""
        return f"https://r2.fake/put/{quote(key, safe='')}#{quote(mime_type, safe='')}"

    async def put(self, key: str, content: bytes, mime_type: str) -> None:
        """Store the real byte count and type, like the bucket would."""
        self._bucket[key] = StoredObjectMeta(size_bytes=len(content), mime_type=mime_type)

    async def read_url(self, key: str) -> str:
        """Deterministic fake GET URL carrying the key."""
        return f"https://r2.fake/get/{quote(key, safe='')}"

    async def metadata(self, key: str) -> StoredObjectMeta | None:
        """Read the seeded/stored object meta; `None` when it does not exist."""
        return self._bucket.get(key)

    async def remove(self, key: str) -> None:
        """Delete the object; silent when it does not exist."""
        self._bucket.pop(key, None)

    async def copy(self, source: str, destination: str) -> None:
        """Copy an object to a new key; silent when the source does not exist."""
        stored = self._bucket.get(source)
        if stored is not None:
            self._bucket[destination] = stored

    def keys(self) -> list[str]:
        """Fake-only inspector: every key currently in the bucket."""
        return list(self._bucket.keys())
