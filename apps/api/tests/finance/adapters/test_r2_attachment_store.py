"""R2AttachmentStore: `r2_client_config` signing shape + a real MinIO round trip (F2).

MinIO is S3-compatible and ships as the same image used in local dev
(docker-compose) — the round-trip test is the one place apps/api talks to a
real external service instead of a fake; CI provisions MinIO as a service.

Oracle for the signing-shape assertions: apps/web/src/adapters/r2/r2-attachment-store.test.ts.
"""

import os

import httpx
import pytest
from botocore.exceptions import ClientError

from luc_api.finance.adapters.r2_attachment_store import get_r2_client, r2_attachment_store
from luc_api.finance.application.attachment_store import AttachmentStore

_ACCOUNT_ID = "local"
_ENDPOINT = os.environ.get("R2_ENDPOINT", "http://127.0.0.1:9000")
_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "lucminio")
_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "lucminio123")
_BUCKET = os.environ.get("R2_BUCKET", "luc-attachments-test")


# --- signing shape (pure, no network) ---


def test_local_endpoint_forces_path_style_addressing():
    client = get_r2_client("conta-fake", "fake-key", "fake-secret", "http://127.0.0.1:9000")

    url = client.generate_presigned_url(
        "put_object",
        Params={"Bucket": "bucket-teste", "Key": "h-1/staging/att-1"},
        ExpiresIn=300,
    )

    # Path-style: bucket is a path segment, not a subdomain (virtual-style would
    # put it in the host — MinIO/local endpoints don't support that).
    assert url.startswith("http://127.0.0.1:9000/bucket-teste/")


async def test_upload_url_signs_no_checksum_header():
    # Regression guard: a signed checksum header would make the browser's plain
    # `fetch` PUT (which never sends it) fail signature validation on R2.
    client = get_r2_client("conta-fake", "fake-key", "fake-secret")
    store = r2_attachment_store(client=client, bucket="bucket-teste")

    url = await store.upload_url("h-1/staging/att-1", "application/pdf")

    assert "checksum" not in url.lower()


# --- full cycle against real MinIO ---


@pytest.fixture(scope="module")
def bucket_ready() -> None:
    """Creates the test bucket once per module; idempotent, mirrors local dev's `mc mb`."""
    client = get_r2_client(_ACCOUNT_ID, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY, _ENDPOINT)
    try:
        client.create_bucket(Bucket=_BUCKET)
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code")
        if code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
            raise


@pytest.fixture
def store(bucket_ready: None) -> AttachmentStore:
    client = get_r2_client(_ACCOUNT_ID, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY, _ENDPOINT)
    return r2_attachment_store(client=client, bucket=_BUCKET)


async def test_full_cycle_presign_put_copy_presign_get_remove(store: AttachmentStore):
    key_staging = "h-test/staging/att-1"
    key_canonical = "h-test/pay-1/att-1"
    content = b"%PDF-1.4 comprovante de teste"

    async with httpx.AsyncClient() as http:
        # when: presign PUT and upload through the signed URL directly — no
        # bytes through the app
        put_url = await store.upload_url(key_staging, "application/pdf")
        uploaded = await http.put(
            put_url, content=content, headers={"Content-Type": "application/pdf"}
        )

        # then: the object exists with the real uploaded size/type
        assert uploaded.status_code == 200
        meta = await store.metadata(key_staging)
        assert meta is not None
        assert meta.size_bytes == len(content)
        assert meta.mime_type == "application/pdf"

        # when: copied server-side staging→canônico
        await store.copy(key_staging, key_canonical)

        # then: a presigned GET on the canonical key reads the same bytes
        get_url = await store.read_url(key_canonical)
        read_back = await http.get(get_url)
        assert read_back.status_code == 200
        assert read_back.content == content

    # when: removed
    await store.remove(key_canonical)

    # then: it is gone
    assert await store.metadata(key_canonical) is None


async def test_metadata_of_a_missing_key_is_none(store: AttachmentStore):
    assert await store.metadata("h-test/does-not-exist") is None


async def test_copy_of_a_missing_source_is_silent(store: AttachmentStore):
    await store.copy("h-test/does-not-exist", "h-test/also-nowhere")

    assert await store.metadata("h-test/also-nowhere") is None
