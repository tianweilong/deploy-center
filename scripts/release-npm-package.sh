#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-source}"
: "${SOURCE_TAG:?缺少 SOURCE_TAG}"
: "${NPM_PACKAGE_NAME:?缺少 NPM_PACKAGE_NAME}"
: "${NODE_AUTH_TOKEN:?缺少 NODE_AUTH_TOKEN}"

cd "$SOURCE_DIR"

actual_package_name=$(node -p "require('./npx-cli/package.json').name")
root_version=$(node -p "require('./package.json').version")

if [ "$actual_package_name" != "$NPM_PACKAGE_NAME" ]; then
  echo "源仓库 npm 包名 ${actual_package_name} 与请求值 ${NPM_PACKAGE_NAME} 不一致。" >&2
  exit 1
fi

if [[ ! "${SOURCE_TAG}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "发布标签 ${SOURCE_TAG} 不符合 vX.Y.Z 格式。" >&2
  exit 1
fi

tag_major="${BASH_REMATCH[1]}"
tag_minor="${BASH_REMATCH[2]}"
tag_patch="${BASH_REMATCH[3]}"

if [[ ! "${root_version}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "根 package.json 版本 ${root_version} 不符合 X.Y.Z 格式。" >&2
  exit 1
fi

base_major="${BASH_REMATCH[1]}"
base_minor="${BASH_REMATCH[2]}"
base_patch="${BASH_REMATCH[3]}"

if [ "${tag_major}" != "${base_major}" ] || [ "${tag_minor}" != "${base_minor}" ]; then
  echo "发布标签 ${SOURCE_TAG} 的 major/minor 与基线版本 ${root_version} 不一致。" >&2
  exit 1
fi

mapped_base_patch=$((tag_patch / 100))
release_seq=$((tag_patch % 100))

if [ "${mapped_base_patch}" -ne "${base_patch}" ]; then
  echo "发布标签 ${SOURCE_TAG} 的 patch 无法映射到基线 patch ${base_patch}。" >&2
  exit 1
fi

if [ "${release_seq}" -lt 1 ] || [ "${release_seq}" -gt 99 ]; then
  echo "发布标签 ${SOURCE_TAG} 的发布序号 ${release_seq} 超出 1..99 范围。" >&2
  exit 1
fi

PUBLISH_VERSION="${SOURCE_TAG#v}"

pnpm i --frozen-lockfile
pnpm run build:npx

cd npx-cli
npm version "$PUBLISH_VERSION" --no-git-tag-version --allow-same-version
rm -f ./*.tgz
npm pack
PACKAGE_FILE=$(find . -maxdepth 1 -name '*.tgz' | head -n1)

if [ -z "$PACKAGE_FILE" ] || [ ! -f "$PACKAGE_FILE" ]; then
  echo '缺少待发布的 tgz 包。' >&2
  exit 1
fi

if npm view "${actual_package_name}@${PUBLISH_VERSION}" version >/dev/null 2>&1; then
  echo "${actual_package_name}@${PUBLISH_VERSION} 已存在，跳过发布。"
  exit 0
fi

echo "通过 NPM_TOKEN 发布 ${PACKAGE_FILE} -> ${actual_package_name}@${PUBLISH_VERSION}"
npm publish "$PACKAGE_FILE" --access public
