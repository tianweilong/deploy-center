#!/usr/bin/env bash
set -euo pipefail

release_root="${1:-}"

if [ -z "${release_root}" ]; then
  echo '缺少 release 产物目录参数。' >&2
  exit 1
fi

if [ ! -d "${release_root}" ]; then
  echo "release 产物目录不存在：${release_root}" >&2
  exit 1
fi

checksum_files=()
while IFS= read -r checksum_file; do
  checksum_files+=("${checksum_file}")
done < <(find "${release_root}" -type f -name '*-checksums.txt' | sort)

if [ "${#checksum_files[@]}" -eq 0 ]; then
  echo "在 ${release_root} 中未找到校验文件。" >&2
  exit 1
fi

target_name="$(basename "${checksum_files[0]}")"
merged_file="${release_root}/${target_name}"
tmp_file="${merged_file}.tmp"

: > "${tmp_file}"

for checksum_file in "${checksum_files[@]}"; do
  if [ "$(basename "${checksum_file}")" != "${target_name}" ]; then
    echo "发现不一致的校验文件名：${checksum_file}" >&2
    exit 1
  fi
  cat "${checksum_file}" >> "${tmp_file}"
done

sort -u "${tmp_file}" > "${merged_file}"
rm -f "${tmp_file}"

for checksum_file in "${checksum_files[@]}"; do
  if [ "${checksum_file}" != "${merged_file}" ]; then
    rm -f "${checksum_file}"
  fi
done
