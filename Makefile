# Ruang Informasi 3D — development tasks
#
# Quick start:  make dev      (backend 127.0.0.1:8787 + Vite 5173)
# Single binary: make build   (frontend embedded into the Go binary)

SHELL := /bin/bash
BACKEND_DIR := backend
FRONTEND_DIR := frontend
BIN := $(BACKEND_DIR)/bin/ri3d-server

.PHONY: help dev dev-backend dev-frontend build build-frontend build-backend test test-backend typecheck fmt clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

dev: ## Run the backend and the frontend dev server together
	@echo "Backend → http://127.0.0.1:8787 · Frontend → http://localhost:5173 (Ctrl+C to stop)"
	@trap 'kill 0' INT TERM; \
	  (cd $(BACKEND_DIR) && go run ./cmd/ri3d-server) & \
	  (cd $(FRONTEND_DIR) && npm run dev) & \
	  wait

dev-backend: ## Run the Go API server only
	cd $(BACKEND_DIR) && go run ./cmd/ri3d-server

dev-frontend: ## Run the Vite dev server only (proxies /api to the backend)
	cd $(FRONTEND_DIR) && npm run dev

build: build-frontend build-backend ## Build one binary with the frontend embedded

build-frontend: ## Build the frontend and stage it for embedding
	cd $(FRONTEND_DIR) && npm run build
	rm -rf $(BACKEND_DIR)/internal/web/dist
	cp -r $(FRONTEND_DIR)/dist $(BACKEND_DIR)/internal/web/dist

build-backend: ## Compile the production server binary
	cd $(BACKEND_DIR) && go build -tags prod -o bin/ri3d-server ./cmd/ri3d-server

test: test-backend ## Run the backend test suite

test-backend:
	cd $(BACKEND_DIR) && go test ./...

typecheck: ## Type-check the frontend
	cd $(FRONTEND_DIR) && npx tsc -b

fmt: ## Format Go sources
	cd $(BACKEND_DIR) && go fmt ./...

clean: ## Remove build artifacts
	rm -rf $(BACKEND_DIR)/bin $(BACKEND_DIR)/internal/web/dist $(FRONTEND_DIR)/dist
