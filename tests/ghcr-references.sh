#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

files=(
  README.md
  docs/rollout.md
  config/services.vibe-kanban.json
  config/services.new-api.json
)

for file in "${files[@]}"; do
  ! grep -q 'ccr.ccs.tencentyun.com' "$file"
done

! grep -q 'TENCENT_REGISTRY' README.md
! grep -q 'TENCENT_REGISTRY' docs/rollout.md

grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' config/services.vibe-kanban.json
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' config/services.vibe-kanban.json
grep -q 'ghcr.io/tianweilong/new-api' config/services.new-api.json

grep -q 'GITHUB_TOKEN' README.md
grep -q 'read:packages' README.md
grep -q 'read:packages' docs/rollout.md
