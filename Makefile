# KK Connect — local development
#
# Usage:
#   make tunnel    — open IAP SSH tunnel (Postgres:5432, Redis:6379)
#   make api       — run FastAPI locally (needs tunnel for DB/Redis)
#   make ui        — run Next.js dev server
#   make dev       — tunnel + api + ui together
#   make stop      — kill all local dev processes

PROJECT  := kumuda-d2c11
VM       := kkconnect-prod
ZONE     := asia-south1-a

# Load env vars from .env
include .env
export

LOCAL_DATABASE_URL := postgresql+asyncpg://postgres:$(POSTGRES_PASSWORD)@localhost:5432/postgres
LOCAL_REDIS_URL    := redis://:$(REDIS_PASSWORD)@localhost:6379

.PHONY: tunnel api ui dev stop

## Open IAP SSH tunnel to forward Postgres and Redis from VM
tunnel:
	@echo "Opening IAP tunnel — Postgres(:5432) + Redis(:6379) from $(VM)..."
	@gcloud compute ssh kkconsultancy@$(VM) \
		--zone=$(ZONE) \
		--tunnel-through-iap \
		--project=$(PROJECT) \
		--quiet \
		-- -L 5432:127.0.0.1:5432 -L 6379:127.0.0.1:6379 -N &
	@echo $$! > .tunnel.pid
	@sleep 3
	@echo "Tunnel ready."

## Run the API (uvicorn) locally
api:
	@echo "Starting API on http://localhost:8000..."
	DATABASE_URL="$(LOCAL_DATABASE_URL)" \
		REDIS_URL="$(LOCAL_REDIS_URL)" \
		ENVIRONMENT=local \
		ENABLE_AWS_S3=true \
		AWS_ACCESS_KEY_ID="$(AWS_ACCESS_KEY_ID)" \
		AWS_SECRET_ACCESS_KEY="$(AWS_SECRET_ACCESS_KEY)" \
		S3_ENDPOINT_URL="$(S3_ENDPOINT_URL)" \
		S3_BUCKET="$(S3_BUCKET)" \
		S3_ADDRESSING_STYLE=path \
		OSS_JWT_SECRET="$(OSS_JWT_SECRET)" \
		MINIO_ENDPOINT="storage.googleapis.com" \
		MINIO_PUBLIC_ENDPOINT="https://storage.googleapis.com" \
		MINIO_ACCESS_KEY="$(AWS_ACCESS_KEY_ID)" \
		MINIO_SECRET_KEY="$(AWS_SECRET_ACCESS_KEY)" \
		MINIO_BUCKET="$(S3_BUCKET)" \
		MINIO_SECURE="true" \
		.venv/bin/uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload

## Run the UI (Next.js dev) locally
ui:
	@echo "Starting UI on http://localhost:3010..."
	cd ui && BACKEND_URL=http://localhost:8000 npm run dev -- -p 3010

## Run everything (tunnel + api + ui)
dev:
	@echo "Starting local dev stack..."
	$(MAKE) tunnel
	$(MAKE) api &
	@sleep 5
	$(MAKE) ui

## Stop all local dev processes
stop:
	@echo "Stopping..."
	@-kill $$(cat .tunnel.pid 2>/dev/null) 2>/dev/null && rm -f .tunnel.pid
	@-pkill -f "uvicorn api.app:app" 2>/dev/null
	@-pkill -f "next dev" 2>/dev/null
	@echo "Done."
