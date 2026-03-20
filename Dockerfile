FROM node:20-alpine AS frontend
WORKDIR /src/web/frontend
COPY web/frontend/package.json web/frontend/package-lock.json ./
RUN npm ci
COPY web/frontend/ .
RUN npm run build

FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/web/dist ./web/dist/
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /light_vm ./cmd/light_vm

FROM alpine:3.20
RUN apk --no-cache add ca-certificates tzdata && \
    adduser -D -h /app lightvm
USER lightvm
WORKDIR /app
COPY --from=builder /light_vm /usr/local/bin/light_vm
VOLUME ["/app/data"]
EXPOSE 9090
ENTRYPOINT ["light_vm"]
CMD ["--config", "/app/light_vm.yml"]
