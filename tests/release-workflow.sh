#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
file='.github/workflows/release-service.yml'

grep -q 'packages: write' "$file"
grep -q 'docker/setup-qemu-action@v3' "$file"
grep -q 'docker/build-push-action@v6' "$file"
grep -q 'registry: ghcr.io' "$file"
grep -q 'fromJSON(needs.prepare.outputs.matrix)' "$file"
grep -q 'fail-fast: false' "$file"
grep -q 'linux/amd64,linux/arm64' "$file"
! grep -q 'TENCENT_REGISTRY' "$file"
! grep -q 'ccr.ccs.tencentyun.com' "$file"
! grep -q 'make push-' "$file"
! grep -q 'Install source dependencies for make metadata' "$file"
