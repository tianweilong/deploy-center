#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
workflow='.github/workflows/release-service.yml'
script='scripts/release-npm-package.sh'

grep -q 'npm_package_name' "$workflow"
grep -q 'release-npm-assets:' "$workflow"
grep -q 'release-github-release:' "$workflow"
grep -q 'release-npm:' "$workflow"
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
if grep -q 'make npx-dev-build' "$script"; then
  echo '不应依赖 make npx-dev-build。' >&2
  exit 1
fi
grep -q 'NPM_PACKAGE_NAME' "$script"
grep -q 'NPM_PACKAGE_DIR' "$script"
grep -q 'NPM_VERSION_STRATEGY' "$script"
grep -q 'root_version' "$script"
grep -q 'case "${NPM_VERSION_STRATEGY}"' "$script"
grep -q 'mapped_base_patch' "$script"
grep -q 'release_seq' "$script"
grep -q 'PUBLISH_VERSION' "$script"
grep -q 'BUILD_ONLY' "$script"
grep -q 'release_package_key=' "$script"
grep -q 'NPM_PACKAGE_NAME##' "$script"
grep -q 'TARGET_OS' "$script"
grep -q 'TARGET_ARCH' "$script"
grep -q 'resolve_source_path' "$script"
grep -q 'validate-npm-build-contract.mjs' "$script"
grep -q 'SCRIPT_DIR=' "$script"
grep -q 'node "${SCRIPT_DIR}/validate-npm-build-contract.mjs"' "$script"
grep -q 'manifest.json' "$script"
grep -q 'manifest_files' "$script"
grep -q 'JSON.parse(process.argv\[1\])' "$script"
if grep -q "fs.readFileSync(0, 'utf8')" "$script"; then
  echo 'manifest_files 不应再通过 stdin 管道解析 contract_json。' >&2
  exit 1
fi
grep -q 'checksums.txt' "$script"
grep -q "createHash('sha256')" "$script"
grep -q 'pnpm run build:npx' "$script"
if grep -q 'cp "${PACKAGE_FILE}" "${artifact_dir}/${asset_name}"' "$script"; then
  echo 'BUILD_ONLY 不应再把 npm tgz 直接当作平台 release 资产。' >&2
  exit 1
fi
grep -q 'BUILD_ARTIFACT_DIR: ../npm-artifacts/${{ matrix.target }}' "$workflow"
grep -q 'id-token: write' "$workflow"
grep -q 'gh release create' "$workflow"
grep -q 'bash ./scripts/merge-release-checksums.sh release-artifacts' "$workflow"
if grep -q -- '--verify-tag' "$workflow"; then
  echo 'GitHub Release 分发不应要求仓库内预先存在同名 tag。' >&2
  exit 1
fi
grep -q 'npm publish' "$script"
if grep -q 'cp -R "${artifact_package_dir}/." "${package_dir}/"' "$script"; then
  echo '不应再把平台 package 内容合并回轻量 npm 包。' >&2
  exit 1
fi
if grep -q 'NPM_RELEASE_PACKAGE_KEY' "$script"; then
  echo '脚本不应再依赖 NPM_RELEASE_PACKAGE_KEY。' >&2
  exit 1
fi
if grep -q 'NPM_RELEASE_REPOSITORY' "$script"; then
  echo '脚本不应再依赖 NPM_RELEASE_REPOSITORY。' >&2
  exit 1
fi
if grep -q 'NODE_AUTH_TOKEN' "$script"; then
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
if grep -q -- '--provenance' "$script"; then
  echo 'Trusted Publishing 由 npm 自动处理 provenance，不应手工追加 --provenance。' >&2
  exit 1
fi
if grep -q 'shasum -a 256' "$script"; then
  echo '发布脚本不应再依赖 shasum 生成校验文件。' >&2
  exit 1
fi
grep -q 'package.json' "$script"
if grep -q './npx-cli/package.json' "$script"; then
  echo '发布脚本不应写死 npx-cli/package.json 路径。' >&2
  exit 1
fi
