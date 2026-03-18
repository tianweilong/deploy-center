#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/npm-release-common.sh"

TARGET_OS="${TARGET_OS:-}"
TARGET_ARCH="${TARGET_ARCH:-}"
BUILD_ARTIFACT_DIR="${BUILD_ARTIFACT_DIR:-}"
ARCHIVE_EXT="${ARCHIVE_EXT:-}"

init_npm_release_context "${1:-source}"

: "${TARGET_OS:?缺少 TARGET_OS}"
: "${TARGET_ARCH:?缺少 TARGET_ARCH}"
: "${ARCHIVE_EXT:?缺少 ARCHIVE_EXT}"

if [ -n "${BUILD_ARTIFACT_DIR}" ]; then
  BUILD_ARTIFACT_DIR="$(resolve_source_path "${SOURCE_ROOT}" "${BUILD_ARTIFACT_DIR}")"
fi

pnpm i --frozen-lockfile
TARGET_OS="${TARGET_OS}" TARGET_ARCH="${TARGET_ARCH}" pnpm run build:npx

dist_platform_dir="$(resolve_dist_platform_dir "${TARGET_OS}" "${TARGET_ARCH}")"
source_dist_dir="${NPM_PACKAGE_DIR%/}/dist/${dist_platform_dir}"

if [ ! -d "${source_dist_dir}" ]; then
  echo "缺少平台构建目录：${source_dist_dir}" >&2
  exit 1
fi

node "${SCRIPT_DIR}/validate-npm-build-contract.mjs" "${source_dist_dir}" >/dev/null

artifact_dir="${BUILD_ARTIFACT_DIR:-.release-artifacts/${TARGET_OS}-${TARGET_ARCH}}"
asset_name="${RELEASE_TAG}-${TARGET_OS}-${TARGET_ARCH}.${ARCHIVE_EXT}"
archive_path="${artifact_dir}/${asset_name}"
stage_dir="${artifact_dir}/stage"
rm -rf "${artifact_dir}"
mkdir -p "${artifact_dir}"
manifest_files=$(node "${SCRIPT_DIR}/validate-npm-build-contract.mjs" --print-files "${source_dist_dir}")
copy_manifest_files_to_stage "${source_dist_dir}" "${stage_dir}" "${manifest_files}"
create_platform_archive "${stage_dir}" "${archive_path}" "${ARCHIVE_EXT}"
checksum_file="${artifact_dir}/${RELEASE_PACKAGE_KEY}-${SOURCE_TAG}-checksums.txt"
(
  cd "${artifact_dir}"
  node -e "const fs = require('fs'); const crypto = require('crypto'); const filePath = process.argv[1]; const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); process.stdout.write(hash + '  ' + filePath + '\\n');" "${asset_name}" > "$(basename "${checksum_file}")"
)

echo "仅构建 ${TARGET_OS}-${TARGET_ARCH} Release 资产目录：${artifact_dir}"
