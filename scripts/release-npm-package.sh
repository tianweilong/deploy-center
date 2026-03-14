#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-source}"
: "${SOURCE_TAG:?缺少 SOURCE_TAG}"
: "${NPM_PACKAGE_NAME:?缺少 NPM_PACKAGE_NAME}"

cd "$SOURCE_DIR"

actual_package_name=$(node -p "require('./npx-cli/package.json').name")
root_version=$(node -p "require('./package.json').version")
npx_version=$(node -p "require('./npx-cli/package.json').version")
expected_version="${SOURCE_TAG#v}"

if [ "$actual_package_name" != "$NPM_PACKAGE_NAME" ]; then
  echo "源仓库 npm 包名 ${actual_package_name} 与请求值 ${NPM_PACKAGE_NAME} 不一致。" >&2
  exit 1
fi

if [ "$root_version" != "$expected_version" ] || [ "$npx_version" != "$expected_version" ]; then
  echo "源码版本与标签不一致：root=${root_version} npx=${npx_version} tag=${SOURCE_TAG}" >&2
  exit 1
fi

pnpm i --frozen-lockfile
make npx-dev-build
SOURCE_TAG="$SOURCE_TAG" bash scripts/release/publish-npm-package.sh
