"""`AttachmentStore` adapter over an S3-compatible bucket (ADR-0008).

Thin wrapper over boto3's S3 client — R2 is S3-compatible, and MinIO (local
dev/CI) speaks the same protocol via an endpoint override. Presigning is local
computation (no network, stays sync); the SDK has no official async client, so
every network call (`put`, `metadata`, `remove`, `copy`) runs in `to_thread`.

Ports 1:1 from `apps/web/src/adapters/r2/r2-attachment-store.ts` (ADR-0016).
"""

from __future__ import annotations

import os
from asyncio import to_thread
from dataclasses import dataclass
from typing import TYPE_CHECKING

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from luc_api.finance.application.attachment_store import AttachmentStore, StoredObjectMeta

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

__all__ = [
    "R2AttachmentStore",
    "R2ClientConfig",
    "get_r2_client",
    "r2_attachment_store",
    "r2_client_config",
]

_SIGNED_URL_EXPIRES_SECONDS = 5 * 60
_MISSING_OBJECT_CODES = ("404", "NoSuchKey", "NotFound")


@dataclass(frozen=True, slots=True)
class R2ClientConfig:
    """Region/endpoint/`Config` resolved for boto3 — R2 in production, MinIO in dev/CI."""

    region_name: str
    endpoint_url: str
    config: Config


def r2_client_config(account_id: str, endpoint: str | None = None) -> R2ClientConfig:
    """Resolves the boto3 client shape for R2 (or a local/CI endpoint override).

    The `request_checksum_calculation`/`response_checksum_validation` pair pinned
    to "when_required" is critical: recent botocore defaults to always calculating
    checksums, which makes presigned PUT URLs demand checksum headers a browser's
    plain `fetch` never sends — R2/MinIO would reject the signature and every
    direct upload would fail.

    Args:
        account_id: The R2 account id (used to derive the default endpoint).
        endpoint: Overrides the endpoint (local dev/CI, pointed at MinIO); when set,
            path-style addressing is forced since MinIO does not support virtual-hosted
            buckets the way R2/S3 do.

    Returns:
        The resolved region, endpoint and `Config` for `boto3.client("s3", ...)`.
    """
    if endpoint:
        return R2ClientConfig(
            region_name="us-east-1",
            endpoint_url=endpoint,
            config=Config(
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
                s3={"addressing_style": "path"},
            ),
        )
    return R2ClientConfig(
        region_name="auto",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        config=Config(
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def _read_env(name: str) -> str:
    """Reads a required environment variable; fails loud and early if absent."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is not set")
    return value


def get_r2_client(
    account_id: str,
    access_key_id: str,
    secret_access_key: str,
    endpoint: str | None = None,
) -> S3Client:
    """Builds a boto3 S3 client for R2 (or MinIO, via `endpoint`).

    Args:
        account_id: The R2 account id.
        access_key_id: The R2 access key (not the Cloudflare API token).
        secret_access_key: The R2 secret key.
        endpoint: Overrides the endpoint (local dev/CI, pointed at MinIO).

    Returns:
        A boto3 S3 client configured for R2/MinIO.
    """
    resolved = r2_client_config(account_id, endpoint)
    # boto3-stubs declares hundreds of `client()` overloads, one per AWS service;
    # pyright flags the whole declaration as "partially unknown" even though the
    # "s3" overload actually picked here resolves concretely to `S3Client`.
    return boto3.client(  # pyright: ignore[reportUnknownMemberType]
        "s3",
        region_name=resolved.region_name,
        endpoint_url=resolved.endpoint_url,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        config=resolved.config,
    )


class R2AttachmentStore:
    """`AttachmentStore` adapter over an S3-compatible bucket (R2/MinIO)."""

    def __init__(self, client: S3Client, bucket: str) -> None:
        """Wraps a boto3 S3 client scoped to a single bucket."""
        self._client = client
        self._bucket = bucket

    async def upload_url(self, key: str, mime_type: str) -> str:
        """Signs a PUT URL for the browser to upload the object directly."""
        return self._client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": mime_type},
            ExpiresIn=_SIGNED_URL_EXPIRES_SECONDS,
        )

    async def put(self, key: str, content: bytes, mime_type: str) -> None:
        """Uploads bytes server-side (the backfill path, no browser involved)."""
        await to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=content,
            ContentType=mime_type,
        )

    async def read_url(self, key: str) -> str:
        """Signs a GET URL to view/download the object."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=_SIGNED_URL_EXPIRES_SECONDS,
        )

    async def metadata(self, key: str) -> StoredObjectMeta | None:
        """Reads the real size/type of the stored object; `None` when it does not exist."""
        try:
            head = await to_thread(self._client.head_object, Bucket=self._bucket, Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in _MISSING_OBJECT_CODES:
                return None
            raise
        return StoredObjectMeta(
            size_bytes=head.get("ContentLength", 0),
            mime_type=head.get("ContentType", ""),
        )

    async def remove(self, key: str) -> None:
        """Deletes the object; S3 `DeleteObject` is already silent when it is absent."""
        await to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)

    async def copy(self, source: str, destination: str) -> None:
        """Copies server-side (staging→canônico); silent when the source does not exist."""
        try:
            await to_thread(
                self._client.copy_object,
                Bucket=self._bucket,
                Key=destination,
                CopySource={"Bucket": self._bucket, "Key": source},
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") not in _MISSING_OBJECT_CODES:
                raise


def r2_attachment_store(
    client: S3Client | None = None, bucket: str | None = None
) -> AttachmentStore:
    """Builds the `AttachmentStore` adapter over R2 — env-resolved by default.

    Args:
        client: Injectable boto3 S3 client (tests only); defaults to the
            env-resolved R2/MinIO client (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
            `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`).
        bucket: Injectable bucket name (tests only); defaults to `R2_BUCKET`.

    Returns:
        The `AttachmentStore` adapter.
    """
    resolved_client = (
        client
        if client is not None
        else get_r2_client(
            _read_env("R2_ACCOUNT_ID"),
            _read_env("R2_ACCESS_KEY_ID"),
            _read_env("R2_SECRET_ACCESS_KEY"),
            os.environ.get("R2_ENDPOINT"),
        )
    )
    resolved_bucket = bucket if bucket is not None else _read_env("R2_BUCKET")
    return R2AttachmentStore(resolved_client, resolved_bucket)
