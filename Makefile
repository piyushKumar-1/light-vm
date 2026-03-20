.PHONY: build test lint run clean frontend

VERSION ?= dev
COMMIT  := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT)

frontend:
	cd web/frontend && npm ci && npm run build

build: frontend
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o bin/light_vm ./cmd/light_vm

test:
	go test -race ./...

lint:
	golangci-lint run ./...

run: build
	./bin/light_vm --config light_vm.yml

clean:
	rm -rf bin/ light_vm.db web/dist/
