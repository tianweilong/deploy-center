#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
file='.github/workflows/release-service.yml'

grep -q 'packages: write' "$file"
if ! grep -q 'id-token: write' "$file"; then
  echo 'Trusted Publishing 需要 workflow 声明 id-token: write。' >&2
  exit 1
fi
if grep -q '\[self-hosted, Linux, ARM64\]' "$file"; then
  echo '服务构建不应再使用自托管 Linux runner。' >&2
  exit 1
fi
if grep -q '\[self-hosted, macOS, ARM64\]' "$file"; then
  echo 'npm 发布不应再使用自托管 macOS runner。' >&2
  exit 1
fi
test "$(grep -c 'runs-on: ubuntu-latest' "$file")" -eq 5
grep -q 'docker/setup-qemu-action@v3' "$file"
grep -q 'docker/build-push-action@v6' "$file"
grep -q 'registry: ghcr.io' "$file"
grep -q 'fromJSON(needs.prepare.outputs.matrix)' "$file"
grep -q 'fail-fast: false' "$file"
grep -q 'linux/amd64,linux/arm64' "$file"
grep -q 'source_tag' "$file"
grep -q 'SOURCE_TAG' "$file"
grep -q 'release_targets' "$file"
grep -q 'if \[ "${target}" = '\''npm'\'' \]; then' "$file"
grep -q 'if \[ -n "${target}" \]; then' "$file"
grep -q 'target_services="${target_services},${target}"' "$file"
grep -q 'config/services\.\${source_repository_name}\.json' "$file"
grep -q '缺少服务构建配置文件' "$file"
grep -q 'npm_package_name' "$file"
grep -q 'npm_package_dir' "$file"
grep -q 'npm_version_strategy' "$file"
if grep -q 'npm_release_package_key' "$file"; then
  echo 'workflow 不应再要求显式传入 npm_release_package_key。' >&2
  exit 1
fi
if grep -q 'npm_release_repository' "$file"; then
  echo 'workflow 不应再要求显式传入 npm_release_repository。' >&2
  exit 1
fi
if grep -q 'LEGACY_TARGET_SERVICES' "$file"; then
  echo '不应再保留 LEGACY_TARGET_SERVICES 兼容变量。' >&2
  exit 1
fi
if grep -q '^      services:$' "$file"; then
  echo '不应再保留 services 输入。' >&2
  exit 1
fi
grep -q 'has_npm' "$file"
grep -q 'npm_matrix' "$file"
grep -q 'release-npm-assets:' "$file"
grep -q 'prepare-npm-publish-input:' "$file"
grep -q 'release-github-release:' "$file"
grep -q 'release-npm:' "$file"
grep -q 'npm-publish-input' "$file"
grep -q 'linux-arm64' "$file"
grep -q 'windows-latest' "$file"
grep -q 'darwin-arm64' "$file"
grep -q 'upload-artifact' "$file"
grep -q 'download-artifact' "$file"
grep -q '下载 npm 发布输入' "$file"
grep -q 'BUILD_ONLY: true' "$file"
grep -q 'gh release create' "$file"
grep -q 'gh release upload' "$file"
grep -q '创建 GitHub Release' "$file"
grep -q '上传 GitHub Release 资产' "$file"
if grep -q -- '--verify-tag' "$file"; then
  echo 'GitHub Release 资产发布不应强依赖仓库内已存在同名 tag。' >&2
  exit 1
fi
grep -q 'github.repository' "$file"
grep -q './scripts/prepare-npm-publish-input.sh source' "$file"
grep -q './scripts/build-npm-release-assets.sh source' "$file"
grep -q './scripts/publish-npm-package.sh' "$file"
if grep -q "matrix.target == 'linux-x64'" "$file"; then
  echo 'npm 发布输入不应依赖固定矩阵分支，应由独立 job 生成。' >&2
  exit 1
fi
if grep -q 'release-npm-package.sh source' "$file"; then
  echo 'workflow 不应再直接调用旧的混合 npm 发布脚本。' >&2
  exit 1
fi
grep -q 'node-version: 24' "$file"
test "$(grep -c '^      - uses: actions/checkout@v6$' "$file")" -eq 6
grep -q 'uses: ./.github/actions/checkout-source' "$file"
grep -q 'uses: ./.github/actions/setup-node-pnpm' "$file"
grep -q 'uses: ./.github/actions/print-runner-info' "$file"
grep -q 'actions/setup-go@v5' "$file"
grep -q "hashFiles('source/go.mod') != ''" "$file"
grep -q 'go-version-file: source/go.mod' "$file"
grep -q "hashFiles('source/rust-toolchain.toml', 'source/rust-toolchain') != ''" "$file"
if grep -q 'toolchain: nightly-' "$file"; then
  echo 'Rust 工具链版本不应在 workflow 中写死，应由源仓库标准文件决定。' >&2
  exit 1
fi
grep -q 'lockfile-path: source/pnpm-lock.yaml' "$file"
grep -q 'pnpm-version: 10.13.1' "$file"
grep -q 'npm-version: 11.5.1' "$file"
grep -q 'target-os: linux' "$file"
grep -q 'target-os: ${{ matrix.target_os }}' "$file"
if ! grep -q 'NODE_OPTIONS: --max-old-space-size=6144' "$file"; then
  echo 'npm 发布步骤需要显式设置 NODE_OPTIONS 以抬高 Node 堆上限。' >&2
  exit 1
fi
if grep -q 'NODE_AUTH_TOKEN' "$file"; then
  echo 'Trusted Publishing 的 workflow 不应再显式注入 NODE_AUTH_TOKEN。' >&2
  exit 1
fi
if grep -q -- '--provenance' "$file"; then
  echo 'workflow 不应手工传递 --provenance，交给 npm 自动处理。' >&2
  exit 1
fi
! grep -q 'update-state:' "$file"
! grep -q './scripts/commit-deployment-state-with-retry.sh' "$file"
! grep -q '^          git push$' "$file"
! grep -q 'TENCENT_REGISTRY' "$file"
! grep -q 'ccr.ccs.tencentyun.com' "$file"
! grep -q 'make push-' "$file"
! grep -q 'target_environment' "$file"
! grep -Eq '^[[:space:]]+environment:' "$file"
if grep -q 'TMPDIR="$(cygpath -m "$RUNNER_TEMP")"' "$file"; then
  echo 'workflow 不应再依赖 TMPDIR 的 Windows 路径 workaround。' >&2
  exit 1
fi
if grep -q '修补 Windows 源仓库打包脚本路径兼容性' "$file"; then
  echo 'workflow 不应再修改源仓库 local-build.sh。' >&2
  exit 1
fi
if grep -q 'uses: ./source/.github/actions/setup-node' "$file"; then
  echo 'workflow 不应再依赖源仓库自带的 setup-node action。' >&2
  exit 1
fi
if grep -q 'bash -n scripts/release-npm-package.sh' '.github/workflows/validate-deployment-config.yml'; then
  echo '部署配置校验 workflow 不应再检查已删除的旧 npm 脚本。' >&2
  exit 1
fi
