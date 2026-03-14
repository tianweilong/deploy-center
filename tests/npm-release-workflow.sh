#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
workflow='.github/workflows/release-service.yml'
script='scripts/release-npm-package.sh'

grep -q 'npm_package_name' "$workflow"
grep -q 'release-npm:' "$workflow"
grep -q 'make npx-dev-build' "$script"
grep -q 'NPM_PACKAGE_NAME' "$script"
grep -q 'scripts/release/publish-npm-package.sh' "$script"
grep -q 'package.json' "$script"
grep -q 'npx-cli/package.json' "$script"
