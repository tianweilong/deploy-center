#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_source_path() {
  local source_root="$1"
  local relative_path="$2"
  node -e "const path = require('node:path'); process.stdout.write(path.resolve(process.argv[1], process.argv[2]));" "$source_root" "$relative_path"
}

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
    SOURCE_DIR_WINDOWS="${source_dir_windows}" ARCHIVE_PATH_WINDOWS="${archive_path_windows}" \
      powershell.exe -NoProfile -Command \
      '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName "System.IO.Compression.FileSystem"; $sourceDir = $env:SOURCE_DIR_WINDOWS; $archivePath = $env:ARCHIVE_PATH_WINDOWS; if ([System.IO.Directory]::GetFileSystemEntries($sourceDir).Count -eq 0) { throw "待压缩目录为空。" }; [System.IO.Compression.ZipFile]::CreateFromDirectory($sourceDir, $archivePath)' \
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

build_release_meta_payload() {
  node -e "process.stdout.write(JSON.stringify({ packageName: process.argv[1], publishVersion: process.argv[2], sourceTag: process.argv[3], distributionMode: process.argv[4], releaseRepository: process.argv[5] }))" \
    "${ACTUAL_PACKAGE_NAME}" \
    "${PUBLISH_VERSION}" \
    "${SOURCE_TAG}" \
    'github_release' \
    'tianweilong/deploy-center'
}

init_npm_release_context() {
  SOURCE_DIR="${1:-source}"
  : "${SOURCE_TAG:?缺少 SOURCE_TAG}"
  : "${NPM_PACKAGE_NAME:?缺少 NPM_PACKAGE_NAME}"
  : "${NPM_PACKAGE_DIR:?缺少 NPM_PACKAGE_DIR}"
  : "${NPM_VERSION_STRATEGY:?缺少 NPM_VERSION_STRATEGY}"

  cd "${SOURCE_DIR}"
  SOURCE_ROOT="$(pwd)"

  PACKAGE_JSON_PATH="${NPM_PACKAGE_DIR%/}/package.json"
  ACTUAL_PACKAGE_NAME=$(node -p "require('./${PACKAGE_JSON_PATH}').name")

  if [ "${ACTUAL_PACKAGE_NAME}" != "${NPM_PACKAGE_NAME}" ]; then
    echo "源仓库 npm 包名 ${ACTUAL_PACKAGE_NAME} 与请求值 ${NPM_PACKAGE_NAME} 不一致。" >&2
    exit 1
  fi

  RELEASE_PACKAGE_KEY="${NPM_PACKAGE_NAME##*/}"

  case "${NPM_VERSION_STRATEGY}" in
    package_json)
      PUBLISH_VERSION=$(node -p "require('./${PACKAGE_JSON_PATH}').version")
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

      local tag_major="${BASH_REMATCH[1]}"
      local tag_minor="${BASH_REMATCH[2]}"
      local tag_patch="${BASH_REMATCH[3]}"

      if [[ ! "${root_version}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        echo "基线版本 ${root_version} 不符合 X.Y.Z 格式。" >&2
        exit 1
      fi

      local base_major="${BASH_REMATCH[1]}"
      local base_minor="${BASH_REMATCH[2]}"
      local base_patch="${BASH_REMATCH[3]}"
      local patch_factor="${NPM_VERSION_PATCH_FACTOR}"

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

  RELEASE_META_PAYLOAD="$(build_release_meta_payload)"
  RELEASE_META_MODULE_URL=$(node -e "const { pathToFileURL } = require('node:url'); process.stdout.write(pathToFileURL(process.argv[1]).href);" "${SCRIPT_DIR}/release-meta.mjs")
  RELEASE_TAG=$(node --input-type=module -e "const moduleUrl = process.argv[1]; const payload = JSON.parse(process.argv[2]); const { buildReleaseMeta } = await import(moduleUrl); process.stdout.write(buildReleaseMeta(payload).releaseTag);" "${RELEASE_META_MODULE_URL}" "${RELEASE_META_PAYLOAD}")
}
