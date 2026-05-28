import assert from 'node:assert/strict';

import {
  assertContains,
  assertFileNotExists,
  assertNotContains,
  readRepoFile,
} from './helpers.mjs';

const file = await readRepoFile('.github/workflows/release-service.yml');
const validateWorkflow = await readRepoFile('.github/workflows/validate-deployment-config.yml');

assertContains(file, 'packages: write');
assertContains(file, 'id-token: write');
assertNotContains(file, '[self-hosted, Linux, ARM64]');
assertNotContains(file, '[self-hosted, macOS, ARM64]');
assert.equal(
  [...file.matchAll(/runs-on: ubuntu-latest/g)].length,
  5,
  'ubuntu-latest job 数量不符合预期',
);
for (const pattern of [
  'docker/build-push-action@v6',
  'registry: ghcr.io',
  'build_matrix: ${{ steps.matrix.outputs.build_matrix }}',
  'manifest_matrix: ${{ steps.matrix.outputs.manifest_matrix }}',
  'node scripts/prepare-release-matrix.mjs --output=build',
  'node scripts/prepare-release-matrix.mjs --output=manifest',
  'fromJSON(needs.prepare.outputs.build_matrix)',
  'fromJSON(needs.prepare.outputs.manifest_matrix)',
  'runs-on: ${{ matrix.runner }}',
  'platforms: ${{ matrix.platform }}',
  'push-by-digest=true',
  '上传镜像 digest',
  '下载镜像 digest',
  'pattern: image-digest-${{ matrix.service }}--*',
  '合并镜像 manifest',
  'docker buildx imagetools create',
  'fail-fast: false',
  'linux/amd64,linux/arm64',
  'source_tag',
  'SOURCE_TAG',
  'release_targets',
  'if [ "${target}" = \'npm\' ]; then',
  'if [ -n "${target}" ]; then',
  'target_services="${target_services},${target}"',
  'config/services.${source_repository_name}.json',
  '缺少服务构建配置文件',
  'npm_package_name',
  'npm_package_dir',
  'npm_dist_tag',
  'npm_version_strategy',
  'has_npm',
  'npm_matrix',
  'release-npm-assets:',
  'prepare-npm-publish-input:',
  'release-github-release:',
  'release-npm:',
  'npm-publish-input',
  'linux-arm64',
  'windows-latest',
  'darwin-arm64',
  'upload-artifact',
  'download-artifact',
  '下载 npm 发布输入',
  'BUILD_ONLY: true',
  'gh release create',
  'gh release upload',
  '创建 GitHub Release',
  '上传 GitHub Release 资产',
  'github.repository',
  'node scripts/prepare-release-matrix.mjs',
  'BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"',
  'BUILD_DATE="${BUILD_DATE}"',
  'node scripts/prepare-npm-publish-input.mjs source',
  'node scripts/build-npm-release-assets.mjs source',
  'node scripts/merge-desktop-manifest.mjs release-artifacts',
  'node scripts/publish-npm-package.mjs',
  'NPM_DIST_TAG',
  'node-version: 24',
  'uses: ./.github/actions/checkout-source',
  'uses: ./.github/actions/setup-node-pnpm',
  'uses: ./.github/actions/print-runner-info',
  'actions/setup-go@v5',
  '检测 Go module 文件',
  'source/go.mod',
  'source/go/go.mod',
  "steps.detect-go-module.outputs.path != ''",
  'go-version-file: ${{ steps.detect-go-module.outputs.path }}',
  '安装 Tauri CLI',
  "env.NPM_PACKAGE_NAME == '@vino.tian/vibe-kanban' && matrix.target == 'darwin-arm64'",
  "cargo install tauri-cli --version '^2' --locked",
  "hashFiles('source/rust-toolchain.toml', 'source/rust-toolchain') != ''",
  'lockfile-path: source/pnpm-lock.yaml',
  'pnpm-version: 10.13.1',
  'npm-version: 11.5.1',
  'target-os: linux',
  'target-os: ${{ matrix.target_os }}',
  'NODE_OPTIONS: --max-old-space-size=6144',
  'BUILD_DESKTOP_BUNDLE:',
  'DESKTOP_RELEASE_MODE:',
  'npm-artifacts/${{ matrix.target }}/*.app.tar.gz',
  'npm-artifacts/${{ matrix.target }}/*.AppImage.tar.gz',
  'npm-artifacts/${{ matrix.target }}/*-setup.exe',
  'npm-artifacts/${{ matrix.target }}/*-desktop-manifest-fragment.json',
]) {
  assertContains(file, pattern);
}

for (const pattern of [
  'npm_release_package_key',
  'npm_release_repository',
  'LEGACY_TARGET_SERVICES',
  /^      services:$/m,
  "--verify-tag",
  "matrix.target == 'linux-x64'",
  'release-npm-package.sh source',
  'toolchain: nightly-',
  'NODE_AUTH_TOKEN',
  '--provenance',
  'update-state:',
  './scripts/commit-deployment-state-with-retry.sh',
  /^          git push$/m,
  'TENCENT_REGISTRY',
  'ccr.ccs.tencentyun.com',
  'DOCKERHUB_USERNAME',
  'DOCKERHUB_TOKEN',
  'make push-',
  'target_environment',
  /^[ \t]+environment:/m,
  'TMPDIR="$(cygpath -m "$RUNNER_TEMP")"',
  '修补 Windows 源仓库打包脚本路径兼容性',
  'uses: ./source/.github/actions/setup-node',
  'docker/setup-qemu-action@v3',
]) {
  assertNotContains(file, pattern);
}

assert.equal(
  [...file.matchAll(/^      - uses: actions\/checkout@v6$/gm)].length,
  7,
  'actions/checkout@v6 次数不符合预期',
);
assertNotContains(
  validateWorkflow,
  /bash -n scripts\/|ruby -c scripts\/|ruby scripts\/prepare-release-matrix\.rb/,
  '部署配置校验 workflow 不应再依赖 Bash 或 Ruby 脚本校验。',
);

await assertFileNotExists('tests/release-workflow.sh');
