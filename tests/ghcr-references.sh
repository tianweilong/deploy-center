#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

files=(
  README.md
  docs/rollout.md
  environments/dev/vibe-kanban-remote/deployment.yaml
  environments/dev/vibe-kanban-remote/docker-compose.yml
  environments/dev/vibe-kanban-relay/deployment.yaml
  environments/dev/vibe-kanban-relay/docker-compose.yml
  environments/prod/vibe-kanban-remote/deployment.yaml
  environments/prod/vibe-kanban-remote/docker-compose.yml
  environments/prod/vibe-kanban-relay/deployment.yaml
  environments/prod/vibe-kanban-relay/docker-compose.yml
)

for file in "${files[@]}"; do
  ! grep -q 'ccr.ccs.tencentyun.com' "$file"
done

! grep -q 'TENCENT_REGISTRY' README.md
! grep -q 'TENCENT_REGISTRY' docs/rollout.md

grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/dev/vibe-kanban-remote/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/dev/vibe-kanban-remote/docker-compose.yml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/dev/vibe-kanban-relay/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/dev/vibe-kanban-relay/docker-compose.yml
grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/prod/vibe-kanban-remote/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/prod/vibe-kanban-remote/docker-compose.yml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/prod/vibe-kanban-relay/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/prod/vibe-kanban-relay/docker-compose.yml

grep -q 'GITHUB_TOKEN' README.md
grep -q 'read:packages' README.md
grep -q 'read:packages' docs/rollout.md
