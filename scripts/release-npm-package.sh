#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SOURCE_DIR="${1:-source}"
BUILD_ONLY="${BUILD_ONLY:-false}"
PUBLISH_ONLY="${PUBLISH_ONLY:-false}"
TARGET_OS="${TARGET_OS:-}"
TARGET_ARCH="${TARGET_ARCH:-}"
PACKAGE_FILE="${PACKAGE_FILE:-}"
BUILD_ARTIFACT_DIR="${BUILD_ARTIFACT_DIR:-}"
ARCHIVE_EXT="${ARCHIVE_EXT:-}"
: "${SOURCE_TAG:?缺少 SOURCE_TAG}"
: "${NPM_PACKAGE_NAME:?缺少 NPM_PACKAGE_NAME}"
: "${NPM_PACKAGE_DIR:?缺少 NPM_PACKAGE_DIR}"
: "${NPM_VERSION_STRATEGY:?缺少 NPM_VERSION_STRATEGY}"

if [ "${PUBLISH_ONLY}" = 'true' ]; then
  echo 'PUBLISH_ONLY 已废弃；轻量 npm 包直接从源码目录发布。' >&2
  exit 1
fi

cd "$SOURCE_DIR"
source_root="$(pwd)"

resolve_source_path() {
  node -e "const path = require('node:path'); process.stdout.write(path.resolve(process.argv[1], process.argv[2]));" "$source_root" "$1"
}

if [ -n "$BUILD_ARTIFACT_DIR" ]; then
  BUILD_ARTIFACT_DIR="$(resolve_source_path "$BUILD_ARTIFACT_DIR")"
fi

resolve_dist_platform_dir() {
  local os="$1"
  local arch="$2"

  case "${os}-${arch}" in
    linux-x64)
      echo 'linux-x64'
      ;;
    linux-arm64)
      echo 'linux-arm64'
      ;;
    win32-x64)
      echo 'windows-x64'
      ;;
    darwin-arm64)
      echo 'macos-arm64'
      ;;
    *)
      echo "不支持的 dist 平台目录映射：${os}-${arch}" >&2
      exit 1
      ;;
  esac
}

create_platform_archive() {
  local source_dir="$1"
  local archive_path="$2"
  local archive_ext="$3"

  rm -f "${archive_path}"

  if [ "${archive_ext}" = 'zip' ]; then
    local source_dir_windows
    local archive_path_windows
    source_dir_windows="$(cygpath -w "$source_dir")"
    archive_path_windows="$(cygpath -w "$archive_path")"
    powershell.exe -NoProfile -Command \
      "Compress-Archive -Path '$source_dir_windows\\*' -DestinationPath '$archive_path_windows' -Force" \
      >/dev/null
    return
  fi

  if [ "${archive_ext}" = 'tar.gz' ]; then
    tar -czf "${archive_path}" -C "${source_dir}" .
    return
  fi

  echo "不支持的 archive 扩展名：${archive_ext}" >&2
  exit 1
}

copy_manifest_files_to_stage() {
  local source_dir="$1"
  local stage_dir="$2"
  local manifest_files="$3"

  mkdir -p "${stage_dir}"
  cp "${source_dir}/manifest.json" "${stage_dir}/manifest.json"

  while IFS= read -r relative_path; do
    [ -n "${relative_path}" ] || continue
    mkdir -p "${stage_dir}/$(dirname "${relative_path}")"
    cp "${source_dir}/${relative_path}" "${stage_dir}/${relative_path}"
  done <<< "${manifest_files}"
}

package_json_path="${NPM_PACKAGE_DIR%/}/package.json"
actual_package_name=$(node -p "require('./${package_json_path}').name")

if [ "$actual_package_name" != "$NPM_PACKAGE_NAME" ]; then
  echo "源仓库 npm 包名 ${actual_package_name} 与请求值 ${NPM_PACKAGE_NAME} 不一致。" >&2
  exit 1
fi

release_package_key="${NPM_PACKAGE_NAME##*/}"

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

release_meta_payload=$(node -e "process.stdout.write(JSON.stringify({ packageName: process.argv[1], publishVersion: process.argv[2], sourceTag: process.argv[3], distributionMode: process.argv[4], releaseRepository: process.argv[5] }))" "${actual_package_name}" "${PUBLISH_VERSION}" "${SOURCE_TAG}" 'github_release' 'tianweilong/deploy-center')
release_meta_module_url=$(node -e "const { pathToFileURL } = require('node:url'); process.stdout.write(pathToFileURL(process.argv[1]).href);" "${SCRIPT_DIR}/release-meta.mjs")
release_tag=$(node --input-type=module -e "const moduleUrl = process.argv[1]; const payload = JSON.parse(process.argv[2]); const { buildReleaseMeta } = await import(moduleUrl); process.stdout.write(buildReleaseMeta(payload).releaseTag);" "${release_meta_module_url}" "${release_meta_payload}")

pnpm i --frozen-lockfile
TARGET_OS="${TARGET_OS}" TARGET_ARCH="${TARGET_ARCH}" pnpm run build:npx

if [ "${BUILD_ONLY}" = 'true' ]; then
  : "${ARCHIVE_EXT:?缺少 ARCHIVE_EXT}"
  dist_platform_dir=$(resolve_dist_platform_dir "${TARGET_OS:-}" "${TARGET_ARCH:-}")
  source_dist_dir="${NPM_PACKAGE_DIR%/}/dist/${dist_platform_dir}"

  if [ ! -d "${source_dist_dir}" ]; then
    echo "缺少平台构建目录：${source_dist_dir}" >&2
    exit 1
  fi

  contract_json=$(node "${SCRIPT_DIR}/validate-npm-build-contract.mjs" "${source_dist_dir}")

  artifact_dir="${BUILD_ARTIFACT_DIR:-.release-artifacts/${TARGET_OS:-unknown}-${TARGET_ARCH:-unknown}}"
  asset_name="${release_tag}-${TARGET_OS:-unknown}-${TARGET_ARCH:-unknown}.${ARCHIVE_EXT}"
  archive_path="${artifact_dir}/${asset_name}"
  stage_dir="${artifact_dir}/stage"
  rm -rf "${artifact_dir}"
  mkdir -p "${artifact_dir}"
  manifest_files=$(node "${SCRIPT_DIR}/validate-npm-build-contract.mjs" --print-files "${source_dist_dir}")
  copy_manifest_files_to_stage "${source_dist_dir}" "${stage_dir}" "${manifest_files}"
  create_platform_archive "${stage_dir}" "${archive_path}" "${ARCHIVE_EXT}"
  checksum_file="${artifact_dir}/${release_package_key}-${SOURCE_TAG}-checksums.txt"
  (
    cd "${artifact_dir}"
    node -e "const fs = require('fs'); const crypto = require('crypto'); const filePath = process.argv[1]; const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); process.stdout.write(hash + '  ' + filePath + '\\n');" "${asset_name}" > "$(basename "${checksum_file}")"
  )
  echo "仅构建 ${TARGET_OS:-unknown}-${TARGET_ARCH:-unknown} Release 资产目录：${artifact_dir}"
  exit 0
fi

cd "${NPM_PACKAGE_DIR}"
node "${SCRIPT_DIR}/release-meta.mjs" write "release-meta.json" "${release_meta_payload}" >/dev/null
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

echo "通过 Trusted Publishing 发布 ${PACKAGE_FILE} -> ${actual_package_name}@${PUBLISH_VERSION}"
npm publish "$PACKAGE_FILE" --access public
