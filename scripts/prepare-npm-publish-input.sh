#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/npm-release-common.sh"

OUTPUT_DIR="${OUTPUT_DIR:-../npm-publish-input}"

init_npm_release_context "${1:-source}"
output_dir="$(resolve_source_path "${SOURCE_ROOT}" "${OUTPUT_DIR}")"
package_dir="${output_dir}/package"

pnpm i --frozen-lockfile
pnpm run build:npx

rm -rf "${output_dir}"
mkdir -p "${package_dir}"

tar -C "${NPM_PACKAGE_DIR%/}" --exclude='./*.tgz' -cf - . | tar -C "${package_dir}" -xf -
node "${SCRIPT_DIR}/release-meta.mjs" write "${package_dir}/release-meta.json" "${RELEASE_META_PAYLOAD}" >/dev/null

cat > "${output_dir}/publish-context.json" <<EOF
{
  "packageName": "${ACTUAL_PACKAGE_NAME}",
  "publishVersion": "${PUBLISH_VERSION}",
  "sourceTag": "${SOURCE_TAG}",
  "releaseTag": "${RELEASE_TAG}",
  "releasePackageKey": "${RELEASE_PACKAGE_KEY}",
  "packageDir": "package"
}
EOF

cat > "${output_dir}/manifest.txt" <<EOF
publish-context.json
package/package.json
package/release-meta.json
EOF

echo "已生成 npm 发布输入目录：${output_dir}"
