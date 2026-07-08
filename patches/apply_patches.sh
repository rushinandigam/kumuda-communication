#!/bin/bash
# Re-applies live patches to third-party packages inside dograh-api-1.
# These patches live only in the container's writable layer and are lost
# whenever the container is recreated (VM reboot recovery, image update,
# --force-recreate, or any `docker compose up` that changes its config).
# Run this once after every fresh container creation.
set -e

echo "=== Patch 1: Google STT enable_automatic_punctuation default (many languages/models don't support it) ==="
docker exec -u root dograh-api-1 python3 -c "
path = '/opt/venv/lib/python3.13/site-packages/pipecat/services/google/stt.py'
with open(path) as f:
    content = f.read()

old1 = 'enable_automatic_punctuation: bool | None = True'
new1 = 'enable_automatic_punctuation: bool | None = False  # PATCHED: not all Google STT models/languages support this'
old2 = 'enable_automatic_punctuation=True,'
new2 = 'enable_automatic_punctuation=False,  # PATCHED'

if new1 in content:
    print('  already patched, skipping')
else:
    assert content.count(old1) == 1, f'expected 1 occurrence of old1, found {content.count(old1)}'
    assert content.count(old2) == 1, f'expected 1 occurrence of old2, found {content.count(old2)}'
    content = content.replace(old1, new1).replace(old2, new2)
    with open(path, 'w') as f:
        f.write(content)
    print('  patch applied')
"

echo "=== Patch 2: Deepgram STT legacy websockets client (blocks event loop under backpressure) ==="
docker exec -u root dograh-api-1 python3 -c "
path = '/opt/venv/lib/python3.13/site-packages/deepgram/listen/v1/raw_client.py'
with open(path) as f:
    content = f.read()

old_import = '''try:
    from websockets.legacy.client import connect as websockets_client_connect  # type: ignore
except ImportError:
    from websockets import connect as websockets_client_connect  # type: ignore'''
new_import = '''# PATCHED: force modern non-blocking websockets client (legacy client's
# SSL write can block the asyncio event loop under network backpressure).
from websockets import connect as websockets_client_connect  # type: ignore'''

old_call = 'async with websockets_client_connect(ws_url, extra_headers=headers) as protocol:'
new_call = 'async with websockets_client_connect(ws_url, additional_headers=headers) as protocol:'

if old_import in content:
    content = content.replace(old_import, new_import)
    content = content.replace(old_call, new_call)
    with open(path, 'w') as f:
        f.write(content)
    print('  patch applied')
else:
    print('  already patched (or import block not found), skipping')
"

echo "=== Patch 3: MinIO filesystem presigned URLs (bucket is private, no public read policy) ==="
docker exec -u root dograh-api-1 python3 -c "
path = '/app/api/services/filesystem/minio.py'
with open(path) as f:
    content = f.read()

if 'PATCHED: generate a real presigned URL' in content:
    print('  already patched, skipping')
else:
    if 'from datetime import timedelta' not in content:
        content = content.replace(
            'import asyncio\nimport io\nimport json',
            'import asyncio\nimport io\nimport json\nfrom datetime import timedelta',
            1,
        )

    old_method = '''    async def aget_signed_url(
        self,
        file_path: str,
        expiration: int = 3600,
        force_inline: bool = False,
        use_internal_endpoint: bool = False,
    ) -> Optional[str]:
        try:
            if use_internal_endpoint:
                protocol = \"https\" if self.secure else \"http\"
                base = f\"{protocol}://{self.endpoint}\"
            else:
                base = self.public_endpoint
            return f\"{base}/{self.bucket_name}/{file_path}\"
        except Exception as e:
            logger.error(f\"Error generating MinIO URL: {e}\")
            return None'''

    new_method = '''    async def aget_signed_url(
        self,
        file_path: str,
        expiration: int = 3600,
        force_inline: bool = False,
        use_internal_endpoint: bool = False,
    ) -> Optional[str]:
        # PATCHED: generate a real presigned URL (bucket is private, no public
        # read policy) instead of an unsigned link. use_internal_endpoint is
        # ignored now since the SDK client already knows its own endpoint.
        try:
            def _presign():
                return self.client.presigned_get_object(
                    self.bucket_name, file_path, expires=timedelta(seconds=expiration)
                )
            return await asyncio.to_thread(_presign)
        except Exception as e:
            logger.error(f\"Error generating MinIO presigned URL: {e}\")
            return None'''

    assert old_method in content, 'aget_signed_url method not found verbatim - check for drift'
    content = content.replace(old_method, new_method)
    with open(path, 'w') as f:
        f.write(content)
    print('  patch applied')
"

echo "=== Patch 4: MinIO client explicit region (fixes AccessDenied against GCS interop) ==="
docker exec -u root dograh-api-1 python3 -c "
path = '/app/api/services/filesystem/minio.py'
with open(path) as f:
    content = f.read()

if 'PATCHED: explicit region' in content:
    print('  already patched, skipping')
else:
    old = '''        # Client for internal operations (uploads, etc.)
        self.client = Minio(
            endpoint, access_key=access_key, secret_key=secret_key, secure=secure
        )'''
    new = '''        # Client for internal operations (uploads, etc.)
        # PATCHED: explicit region avoids minio-py auto-detecting the bucket
        # region via GetBucketLocation, which breaks SigV4 signing against
        # GCS'"'"'s S3 interop endpoint and causes every request to fail with
        # a generic AccessDenied (regardless of correct HMAC creds/IAM).
        self.client = Minio(
            endpoint, access_key=access_key, secret_key=secret_key, secure=secure, region='"'"'us-east-1'"'"'
        )'''
    assert content.count(old) == 1, f'expected 1 occurrence, found {content.count(old)}'
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print('  patch applied')
"

echo "=== Restarting dograh-api-1 to load patches ==="
docker restart dograh-api-1
for i in $(seq 1 20); do
  status=$(docker inspect --format='{{.State.Health.Status}}' dograh-api-1 2>/dev/null)
  echo "attempt $i: $status"
  if [ "$status" = "healthy" ]; then break; fi
  sleep 3
done
echo "DONE"
