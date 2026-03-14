#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
file='.github/workflows/release-service.yml'

grep -q 'packages: write' "$file"
if grep -q 'id-token: write' "$file"; then
  echo '切换到 NPM_TOKEN 后不应再要求 id-token: write。' >&2
  exit 1
fi
grep -q 'runs-on: \[self-hosted, Linux, ARM64\]' "$file"
grep -q 'runs-on: \[self-hosted, macOS, ARM64\]' "$file"
test "$(grep -c 'runs-on: ubuntu-latest' "$file")" -eq 2
grep -q 'docker/setup-qemu-action@v3' "$file"
grep -q 'docker/build-push-action@v6' "$file"
grep -q 'registry: ghcr.io' "$file"
grep -q 'fromJSON(needs.prepare.outputs.matrix)' "$file"
grep -q 'fail-fast: false' "$file"
grep -q 'linux/amd64,linux/arm64' "$file"
grep -q 'source_tag' "$file"
grep -q 'SOURCE_TAG' "$file"
grep -q 'release_targets' "$file"
grep -q 'npm_package_name' "$file"
grep -q 'npm_package_dir' "$file"
grep -q 'npm_version_strategy' "$file"
if grep -q 'LEGACY_TARGET_SERVICES' "$file"; then
  echo '不应再保留 LEGACY_TARGET_SERVICES 兼容变量。' >&2
  exit 1
fi
if grep -q '^      services:$' "$file"; then
  echo '不应再保留 services 输入。' >&2
  exit 1
fi
grep -q 'has_npm' "$file"
grep -q 'release-npm:' "$file"
grep -q './scripts/release-npm-package.sh source' "$file"
grep -q 'NODE_AUTH_TOKEN' "$file"
grep -q '\[self-hosted, macOS, ARM64\]' "$file"
if grep -q -- '--provenance' "$file"; then
  echo '切换到 NPM_TOKEN 后 workflow 不应再依赖 provenance 发布。' >&2
  exit 1
fi
grep -q 'git tag --list' "$file"
grep -q 'sort -V' "$file"
grep -q ':latest' "$file"
grep -q './scripts/commit-deployment-state-with-retry.sh' "$file"
! grep -q '^          git push$' "$file"
! grep -q 'TENCENT_REGISTRY' "$file"
! grep -q 'ccr.ccs.tencentyun.com' "$file"
! grep -q 'make push-' "$file"
! grep -q 'target_environment' "$file"
! grep -Eq '^[[:space:]]+environment:' "$file"
