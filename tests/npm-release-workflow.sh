#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
workflow='.github/workflows/release-service.yml'
legacy_script='scripts/release-npm-package.sh'
legacy_matrix_script='scripts/prepare-release-matrix.rb'
common_script='scripts/npm-release-common.mjs'
prepare_script='scripts/prepare-npm-publish-input.mjs'
assets_script='scripts/build-npm-release-assets.mjs'
publish_script='scripts/publish-npm-package.mjs'

if [ -e "$legacy_script" ]; then
  echo '旧的混合 npm 发布脚本应已删除。' >&2
  exit 1
fi
if [ -e "$legacy_matrix_script" ]; then
  echo '旧的 Ruby matrix 脚本应已删除。' >&2
  exit 1
fi

grep -q 'npm_package_name' "$workflow"
grep -q 'release-npm-assets:' "$workflow"
grep -q 'prepare-npm-publish-input:' "$workflow"
grep -q 'release-github-release:' "$workflow"
grep -q 'release-npm:' "$workflow"
grep -q 'npm-publish-input' "$workflow"
grep -q 'node scripts/prepare-npm-publish-input.mjs source' "$workflow"
grep -q 'node scripts/build-npm-release-assets.mjs source' "$workflow"
grep -q 'node scripts/publish-npm-package.mjs' "$workflow"
if grep -q "matrix.target == 'linux-x64'" "$workflow"; then
  echo 'npm 发布输入不应依赖固定矩阵分支，应由独立 job 生成。' >&2
  exit 1
fi
if grep -q 'release-npm-package.sh source' "$workflow"; then
  echo 'workflow 不应再直接调用旧的混合 npm 发布脚本。' >&2
  exit 1
fi
grep -q 'linux-arm64' "$workflow"
grep -q 'windows-latest' "$workflow"
grep -q 'darwin-arm64' "$workflow"
grep -q 'node-version: 24' "$workflow"
test "$(grep -c '^      - uses: actions/checkout@v6$' "$workflow")" -eq 6
grep -q 'uses: ./.github/actions/setup-node-pnpm' "$workflow"
grep -q 'uses: ./.github/actions/checkout-source' "$workflow"
grep -q 'actions/setup-go@v5' "$workflow"
grep -q "hashFiles('source/go.mod') != ''" "$workflow"
grep -q 'go-version-file: source/go.mod' "$workflow"
grep -q 'lockfile-path: source/pnpm-lock.yaml' "$workflow"
grep -q 'pnpm-version: 10.13.1' "$workflow"
grep -q 'npm-version: 11.5.1' "$workflow"
grep -q "hashFiles('source/rust-toolchain.toml', 'source/rust-toolchain') != ''" "$workflow"
if grep -q 'toolchain: nightly-' "$workflow"; then
  echo 'Rust 工具链版本不应在 workflow 中写死，应由源仓库标准文件决定。' >&2
  exit 1
fi
test -f "$prepare_script"
test -f "$assets_script"
test -f "$publish_script"
grep -q "from './npm-release-common.mjs'" "$prepare_script"
grep -q "from './npm-release-common.mjs'" "$assets_script"
grep -q "from './npm-release-common.mjs'" "$publish_script"
grep -q 'publish-context.json' "$prepare_script"
grep -q 'manifest.txt' "$prepare_script"
grep -q 'release-meta.json' "$prepare_script"
grep -q 'package/' "$prepare_script"
grep -q 'validate-npm-build-contract.mjs' "$assets_script"
grep -q 'checksums.txt' "$assets_script"
grep -q "createHash('sha256')" "$common_script"
if grep -q 'npm publish' "$assets_script"; then
  echo '平台资产脚本不应包含 npm publish。' >&2
  exit 1
fi
grep -q 'publish-context.json' "$publish_script"
grep -q 'manifest.txt' "$publish_script"
grep -q "runCommand('npm', \\['pack'\\]" "$publish_script"
grep -q "runCommand('npm', \\['publish'" "$publish_script"
if grep -q 'pnpm i --frozen-lockfile' "$publish_script"; then
  echo '发布脚本不应重新安装依赖。' >&2
  exit 1
fi
if grep -q 'pnpm run build:npx' "$publish_script"; then
  echo '发布脚本不应重新执行 build:npx。' >&2
  exit 1
fi
if grep -q 'path: npm-artifacts/${{ matrix.target }}' "$workflow"; then
  echo 'workflow 不应上传整个 npm-artifacts 目录，否则会把 stage 原始文件一并带进 release。' >&2
  exit 1
fi
grep -q 'path: |' "$workflow"
grep -Fq 'npm-artifacts/${{ matrix.target }}/*.${{ matrix.archive_ext }}' "$workflow"
grep -Fq 'npm-artifacts/${{ matrix.target }}/*-checksums.txt' "$workflow"
if grep -q 'release-npm-package.sh' "$publish_script"; then
  echo '发布脚本不应回退到旧混合脚本。' >&2
  exit 1
fi
if grep -q 'Compress-Archive' "$common_script"; then
  echo 'Windows 压缩不应继续依赖 Compress-Archive，需改用更稳定的 Zip 实现。' >&2
  exit 1
fi
if grep -q 'tar -a -cf' "$common_script"; then
  echo 'Windows zip 打包不应继续依赖 tar -a，需使用可控的 ZipFile 实现。' >&2
  exit 1
fi
if grep -q 'powershell.exe' "$common_script"; then
  echo 'Node 公共脚本不应继续调用 powershell.exe。' >&2
  exit 1
fi
grep -q 'BUILD_ARTIFACT_DIR: ../npm-artifacts/${{ matrix.target }}' "$workflow"
grep -q 'id-token: write' "$workflow"
grep -q 'gh release create' "$workflow"
grep -q 'node scripts/merge-release-checksums.mjs release-artifacts' "$workflow"
if grep -q -- '--verify-tag' "$workflow"; then
  echo 'GitHub Release 分发不应要求仓库内预先存在同名 tag。' >&2
  exit 1
fi
if grep -q 'NODE_AUTH_TOKEN' "$publish_script"; then
  echo 'Trusted Publishing 发布脚本不应再依赖 NODE_AUTH_TOKEN。' >&2
  exit 1
fi
if grep -q 'NODE_AUTH_TOKEN' "$workflow"; then
  echo 'Trusted Publishing workflow 不应再注入 NODE_AUTH_TOKEN。' >&2
  exit 1
fi
if grep -q 'uses: ./source/.github/actions/setup-node' "$workflow"; then
  echo 'workflow 不应再依赖源仓库自带的 setup-node action。' >&2
  exit 1
fi
if grep -q 'registry-url: https://registry.npmjs.org' "$workflow"; then
  echo 'workflow 不应再为 npm 11 写入 registry-url 触发 always-auth 警告。' >&2
  exit 1
fi
if grep -q -- '--provenance' "$publish_script"; then
  echo 'Trusted Publishing 由 npm 自动处理 provenance，不应手工追加 --provenance。' >&2
  exit 1
fi
if grep -q 'shasum -a 256' "$assets_script"; then
  echo '发布脚本不应再依赖 shasum 生成校验文件。' >&2
  exit 1
fi
grep -q 'package.json' "$prepare_script"
grep -q 'package.json' "$publish_script"
if grep -q './npx-cli/package.json' "$publish_script"; then
  echo '发布脚本不应写死 npx-cli/package.json 路径。' >&2
  exit 1
fi
