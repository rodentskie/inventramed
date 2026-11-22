# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t inventramed-worker .
# One image holds both binaries. Pick one with the command:
#   docker run inventramed-worker /usr/local/bin/retry
#   docker run inventramed-worker /usr/local/bin/success
# Config is read from the environment at run time, so no values are baked in.

ARG GO_VERSION=1.27-alpine

# ─── build: compile retry and success ───────────────────────────────────
FROM golang:${GO_VERSION} AS build
WORKDIR /repo

ENV CGO_ENABLED=0

# go.work lists every module, so each one's go.mod must exist for it to load.
COPY go.work go.work.sum ./
COPY apps/worker/go.mod apps/worker/go.sum apps/worker/
COPY apps/consumer/go.mod apps/consumer/go.sum apps/consumer/
COPY libs/go/mq/go.mod libs/go/mq/go.sum libs/go/mq/
COPY libs/go/gsm/go.mod libs/go/gsm/go.sum libs/go/gsm/

RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY apps/worker apps/worker
COPY libs/go libs/go

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd apps/worker && \
    go build -trimpath -ldflags="-s -w" -o /out/retry ./cmd/retry/ && \
    go build -trimpath -ldflags="-s -w" -o /out/success ./cmd/success/

# ─── runner: static binaries, non-root ──────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot AS runner

COPY --from=build /out/retry /out/success /usr/local/bin/

USER nonroot
CMD ["/usr/local/bin/retry"]
