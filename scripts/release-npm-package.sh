#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-source}"
: "${SOURCE_TAG:?缺少 SOURCE_TAG}"
: "${NPM_PACKAGE_NAME:?缺少 NPM_PACKAGE_NAME}"
: "${NODE_AUTH_TOKEN:?缺少 NODE_AUTH_TOKEN}"

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
pnpm run build:npx

cd npx-cli
rm -f ./*.tgz
npm pack
PACKAGE_FILE=$(find . -maxdepth 1 -name '*.tgz' | head -n1)

if [ -z "$PACKAGE_FILE" ] || [ ! -f "$PACKAGE_FILE" ]; then
  echo '缺少待发布的 tgz 包。' >&2
  exit 1
fi

if npm view "${actual_package_name}@${npx_version}" version >/dev/null 2>&1; then
  echo "${actual_package_name}@${npx_version} 已存在，跳过发布。"
  exit 0
fi

echo "通过 NPM_TOKEN 发布 ${PACKAGE_FILE} -> ${actual_package_name}@${npx_version}"
npm publish "$PACKAGE_FILE" --access public
