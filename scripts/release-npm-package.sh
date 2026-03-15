#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-source}"
BUILD_ONLY="${BUILD_ONLY:-false}"
PUBLISH_ONLY="${PUBLISH_ONLY:-false}"
TARGET_OS="${TARGET_OS:-}"
TARGET_ARCH="${TARGET_ARCH:-}"
PACKAGE_FILE="${PACKAGE_FILE:-}"
BUILD_ARTIFACT_DIR="${BUILD_ARTIFACT_DIR:-}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-}"
: "${SOURCE_TAG:?缺少 SOURCE_TAG}"
: "${NPM_PACKAGE_NAME:?缺少 NPM_PACKAGE_NAME}"
: "${NPM_PACKAGE_DIR:?缺少 NPM_PACKAGE_DIR}"
: "${NPM_VERSION_STRATEGY:?缺少 NPM_VERSION_STRATEGY}"

if [ "${BUILD_ONLY}" = 'true' ] && [ "${PUBLISH_ONLY}" = 'true' ]; then
  echo 'BUILD_ONLY 与 PUBLISH_ONLY 不能同时为 true。' >&2
  exit 1
fi

cd "$SOURCE_DIR"

package_json_path="${NPM_PACKAGE_DIR%/}/package.json"
actual_package_name=$(node -p "require('./${package_json_path}').name")

if [ "$actual_package_name" != "$NPM_PACKAGE_NAME" ]; then
  echo "源仓库 npm 包名 ${actual_package_name} 与请求值 ${NPM_PACKAGE_NAME} 不一致。" >&2
  exit 1
fi

case "${NPM_VERSION_STRATEGY}" in
  package_json)
    PUBLISH_VERSION=$(node -p "require('./${package_json_path}').version")
    ;;
  source_tag)
    if [[ ! "${SOURCE_TAG}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
      echo "发布标签 ${SOURCE_TAG} 不符合 vX.Y.Z 格式。" >&2
      exit 1
    fi
    PUBLISH_VERSION="${SOURCE_TAG#v}"
    ;;
  base_patch_offset)
    : "${NPM_BASE_VERSION_FILE:?缺少 NPM_BASE_VERSION_FILE}"
    : "${NPM_VERSION_PATCH_FACTOR:?缺少 NPM_VERSION_PATCH_FACTOR}"

    root_version=$(node -p "require('./${NPM_BASE_VERSION_FILE}').version")

    if [[ ! "${SOURCE_TAG}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
      echo "发布标签 ${SOURCE_TAG} 不符合 vX.Y.Z 格式。" >&2
      exit 1
    fi

    tag_major="${BASH_REMATCH[1]}"
    tag_minor="${BASH_REMATCH[2]}"
    tag_patch="${BASH_REMATCH[3]}"

    if [[ ! "${root_version}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
      echo "基线版本 ${root_version} 不符合 X.Y.Z 格式。" >&2
      exit 1
    fi

    base_major="${BASH_REMATCH[1]}"
    base_minor="${BASH_REMATCH[2]}"
    base_patch="${BASH_REMATCH[3]}"
    patch_factor="${NPM_VERSION_PATCH_FACTOR}"

    if ! [[ "${patch_factor}" =~ ^[1-9][0-9]*$ ]]; then
      echo "npm_version_patch_factor=${patch_factor} 不是有效正整数。" >&2
      exit 1
    fi

    if [ "${tag_major}" != "${base_major}" ] || [ "${tag_minor}" != "${base_minor}" ]; then
      echo "发布标签 ${SOURCE_TAG} 的 major/minor 与基线版本 ${root_version} 不一致。" >&2
      exit 1
    fi

    mapped_base_patch=$((tag_patch / patch_factor))
    release_seq=$((tag_patch % patch_factor))

    if [ "${mapped_base_patch}" -ne "${base_patch}" ]; then
      echo "发布标签 ${SOURCE_TAG} 的 patch 无法映射到基线 patch ${base_patch}。" >&2
      exit 1
    fi

    if [ "${release_seq}" -lt 1 ] || [ "${release_seq}" -ge "${patch_factor}" ]; then
      echo "发布标签 ${SOURCE_TAG} 的发布序号 ${release_seq} 超出 1..$((patch_factor-1)) 范围。" >&2
      exit 1
    fi

    PUBLISH_VERSION="${SOURCE_TAG#v}"
    ;;
  *)
    echo "不支持的 npm_version_strategy：${NPM_VERSION_STRATEGY}" >&2
    exit 1
    ;;
esac

if [ "${PUBLISH_ONLY}" = 'true' ]; then
  : "${ARTIFACTS_DIR:?缺少 ARTIFACTS_DIR}"

  package_dir="${NPM_PACKAGE_DIR%/}"
  found_artifact=false
  while IFS= read -r artifact_package_dir; do
    found_artifact=true
    cp -R "${artifact_package_dir}/." "${package_dir}/"
  done < <(find "${ARTIFACTS_DIR}" -type d -path '*/package' | sort)

  if [ "${found_artifact}" != 'true' ]; then
    echo "在 ${ARTIFACTS_DIR} 中未找到待合并的 package 目录。" >&2
    exit 1
  fi

  cd "${package_dir}"
  npm version "$PUBLISH_VERSION" --no-git-tag-version --allow-same-version
  rm -f ./*.tgz
  npm pack
  PACKAGE_FILE=$(find . -maxdepth 1 -name '*.tgz' | head -n1)

  if [ -z "${PACKAGE_FILE}" ] || [ ! -f "${PACKAGE_FILE}" ]; then
    echo '缺少待发布的 tgz 包。' >&2
    exit 1
  fi

  if npm view "${actual_package_name}@${PUBLISH_VERSION}" version >/dev/null 2>&1; then
    echo "${actual_package_name}@${PUBLISH_VERSION} 已存在，跳过发布。"
    exit 0
  fi

  echo "通过 Trusted Publishing 发布 ${PACKAGE_FILE} -> ${actual_package_name}@${PUBLISH_VERSION}"
  npm publish "$PACKAGE_FILE" --access public
  exit 0
fi

pnpm i --frozen-lockfile
TARGET_OS="${TARGET_OS}" TARGET_ARCH="${TARGET_ARCH}" pnpm run build:npx

cd "${NPM_PACKAGE_DIR}"
npm version "$PUBLISH_VERSION" --no-git-tag-version --allow-same-version
rm -f ./*.tgz
npm pack
PACKAGE_FILE=$(find . -maxdepth 1 -name '*.tgz' | head -n1)

if [ -z "$PACKAGE_FILE" ] || [ ! -f "$PACKAGE_FILE" ]; then
  echo '缺少待发布的 tgz 包。' >&2
  exit 1
fi

if [ "${BUILD_ONLY}" = 'true' ]; then
  artifact_dir="${BUILD_ARTIFACT_DIR:-.release-artifacts/${TARGET_OS:-unknown}-${TARGET_ARCH:-unknown}}"
  rm -rf "${artifact_dir}"
  mkdir -p "${artifact_dir}/package"
  cp -R ./. "${artifact_dir}/package/"
  echo "仅构建 ${TARGET_OS:-unknown}-${TARGET_ARCH:-unknown} 制品目录：${artifact_dir}"
  exit 0
fi

if npm view "${actual_package_name}@${PUBLISH_VERSION}" version >/dev/null 2>&1; then
  echo "${actual_package_name}@${PUBLISH_VERSION} 已存在，跳过发布。"
  exit 0
fi

echo "通过 Trusted Publishing 发布 ${PACKAGE_FILE} -> ${actual_package_name}@${PUBLISH_VERSION}"
npm publish "$PACKAGE_FILE" --access public
