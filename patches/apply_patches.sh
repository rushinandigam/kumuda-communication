#!/bin/bash
# Re-applies live patches to third-party packages inside dograh-api-1.
# These patches modify pip-installed packages (/opt/venv/) and are lost
# whenever the container is recreated. Run once after every fresh creation.
#
# Patches that modify OUR OWN source code (api/) are now baked into the
# git source and no longer need runtime patching:
#   - MinIO presigned URLs + region (minio.py)
#   - SpeechTimeout user_speech_timeout=2.5 (run_pipeline.py)
#   - Empty-transcript "didn't catch that" handler (run_pipeline.py)
#   - Knowledge base tool gating/justification/silent-calls (knowledge_base.py)
set -e

echo "=== Patch 1: Google STT enable_automatic_punctuation default ==="
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

echo "=== Patch 2: Deepgram STT legacy websockets client ==="
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

echo "=== Patch 6 (A+B): Google STT empty-transcript + turn-stop hang fix ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker cp "$SCRIPT_DIR/patch6_turn_detection.py" dograh-api-1:/tmp/patch6_turn_detection.py
docker exec -u root dograh-api-1 python3 /tmp/patch6_turn_detection.py

echo "=== Restarting dograh-api-1 to load patches ==="
docker restart dograh-api-1
for i in $(seq 1 20); do
  status=$(docker inspect --format='{{.State.Health.Status}}' dograh-api-1 2>/dev/null)
  echo "attempt $i: $status"
  if [ "$status" = "healthy" ]; then break; fi
  sleep 3
done
echo "DONE"
