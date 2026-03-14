#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
workflow='.github/workflows/release-service.yml'
script='scripts/release-npm-package.sh'

grep -q 'npm_package_name' "$workflow"
grep -q 'release-npm:' "$workflow"
grep -q 'NODE_VERSION: 24' "$workflow"
grep -q 'npm install -g npm@11.5.1' "$workflow"
if grep -q 'make npx-dev-build' "$script"; then
  echo '不应依赖 make npx-dev-build。' >&2
  exit 1
fi
grep -q 'NPM_PACKAGE_NAME' "$script"
grep -q 'NPM_PACKAGE_DIR' "$script"
grep -q 'NPM_VERSION_STRATEGY' "$script"
grep -q 'root_version' "$script"
grep -q 'case "${NPM_VERSION_STRATEGY}"' "$script"
grep -q 'mapped_base_patch' "$script"
grep -q 'release_seq' "$script"
grep -q 'PUBLISH_VERSION' "$script"
grep -q 'pnpm run build:npx' "$script"
grep -q 'id-token: write' "$workflow"
grep -q 'npm version "$PUBLISH_VERSION" --no-git-tag-version --allow-same-version' "$script"
grep -q 'npm publish' "$script"
if grep -q 'NODE_AUTH_TOKEN' "$script"; then
  echo 'Trusted Publishing 发布脚本不应再依赖 NODE_AUTH_TOKEN。' >&2
  exit 1
fi
if grep -q 'NODE_AUTH_TOKEN' "$workflow"; then
  echo 'Trusted Publishing workflow 不应再注入 NODE_AUTH_TOKEN。' >&2
  exit 1
fi
if grep -q -- '--provenance' "$script"; then
  echo 'Trusted Publishing 由 npm 自动处理 provenance，不应手工追加 --provenance。' >&2
  exit 1
fi
grep -q 'package.json' "$script"
if grep -q './npx-cli/package.json' "$script"; then
  echo '发布脚本不应写死 npx-cli/package.json 路径。' >&2
  exit 1
fi
