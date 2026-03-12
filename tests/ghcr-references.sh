#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

files=(
  README.md
  docs/rollout.md
  environments/vibe-kanban-remote/deployment.yaml
  environments/vibe-kanban-remote/docker-compose.yml
  environments/vibe-kanban-relay/deployment.yaml
  environments/vibe-kanban-relay/docker-compose.yml
)

for file in "${files[@]}"; do
  ! grep -q 'ccr.ccs.tencentyun.com' "$file"
done

! grep -q 'TENCENT_REGISTRY' README.md
! grep -q 'TENCENT_REGISTRY' docs/rollout.md

grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/vibe-kanban-remote/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/vibe-kanban-remote/docker-compose.yml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/vibe-kanban-relay/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/vibe-kanban-relay/docker-compose.yml

grep -q 'GITHUB_TOKEN' README.md
grep -q 'read:packages' README.md
grep -q 'read:packages' docs/rollout.md
