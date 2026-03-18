#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/npm-release-common.sh"

INPUT_DIR="${1:-npm-publish-input}"
if [ ! -d "${INPUT_DIR}" ]; then
  echo "缺少 npm 发布输入目录：${INPUT_DIR}" >&2
  exit 1
fi

input_dir="$(cd "${INPUT_DIR}" && pwd)"
publish_context="${input_dir}/publish-context.json"
manifest_file="${input_dir}/manifest.txt"

if [ ! -f "${publish_context}" ]; then
  echo "缺少发布上下文文件：${publish_context}" >&2
  exit 1
fi
if [ ! -f "${manifest_file}" ]; then
  echo "缺少发布清单文件：${manifest_file}" >&2
  exit 1
fi

while IFS= read -r required_file; do
  [ -n "${required_file}" ] || continue
  if [ ! -e "${input_dir}/${required_file}" ]; then
    echo "发布输入缺少文件：${required_file}" >&2
    exit 1
  fi
done < "${manifest_file}"

package_name="$(node -p "require('${publish_context}').packageName")"
publish_version="$(node -p "require('${publish_context}').publishVersion")"
package_dir_relative="$(node -p "require('${publish_context}').packageDir")"
package_dir="${input_dir}/${package_dir_relative}"
package_json_path="${package_dir}/package.json"

if [ ! -f "${package_json_path}" ]; then
  echo "缺少 package.json：${package_json_path}" >&2
  exit 1
fi

cd "${package_dir}"
npm version "${publish_version}" --no-git-tag-version --allow-same-version
rm -f ./*.tgz
npm pack >/dev/null
package_file="$(find . -maxdepth 1 -name '*.tgz' | head -n1)"

if [ -z "${package_file}" ] || [ ! -f "${package_file}" ]; then
  echo '缺少待发布的 tgz 包。' >&2
  exit 1
fi

if npm view "${package_name}@${publish_version}" version >/dev/null 2>&1; then
  echo "${package_name}@${publish_version} 已存在，跳过发布。"
  exit 0
fi

echo "通过 Trusted Publishing 发布 ${package_file} -> ${package_name}@${publish_version}"
npm publish "${package_file}" --access public
