#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
workflow='.github/workflows/release-service.yml'
script='scripts/release-npm-package.sh'

grep -q 'npm_package_name' "$workflow"
grep -q 'release-npm:' "$workflow"
if grep -q 'make npx-dev-build' "$script"; then
  echo '不应依赖 make npx-dev-build。' >&2
  exit 1
fi
grep -q 'NPM_PACKAGE_NAME' "$script"
grep -q 'pnpm run build:npx' "$script"
grep -q 'npm publish' "$script"
grep -q 'package.json' "$script"
grep -q 'npx-cli/package.json' "$script"
