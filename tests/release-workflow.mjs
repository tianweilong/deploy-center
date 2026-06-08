import assert from 'node:assert/strict';

import {
  assertContains,
  assertFileNotExists,
  assertNotContains,
  readRepoFile,
} from './helpers.mjs';

const file = await readRepoFile('.github/workflows/release-service.yml');
const validateWorkflow = await readRepoFile('.github/workflows/validate-deployment-config.yml');
const workflowOutputScript = await readRepoFile('scripts/write-release-workflow-output.mjs');
const buildImageDigestScript = await readRepoFile('scripts/build-and-push-image-digest.mjs');

assertContains(file, 'packages: write');
assertContains(file, 'id-token: write');
assertNotContains(file, '[self-hosted, Linux, ARM64]');
assertNotContains(file, '[self-hosted, macOS, ARM64]');

for (const pattern of [
  'service_name',
  'SERVICE_NAME: ${{ github.event.client_payload.service_name || inputs.service_name }}',
  'SOURCE_REF: ${{ github.event.client_payload.source_ref || inputs.source_ref }}',
  'SOURCE_SHA: ${{ github.event.client_payload.source_sha || inputs.source_sha }}',
  'SOURCE_TAG: ${{ github.event.client_payload.source_tag || inputs.source_tag }}',
  'node scripts/write-release-workflow-output.mjs prepare',
  'node scripts/write-release-workflow-output.mjs image-env',
  'node scripts/write-release-workflow-output.mjs image-manifest-env',
  'node scripts/write-release-workflow-output.mjs npm-env',
  'node scripts/write-release-workflow-output.mjs npm-github-release-env',
  'node scripts/build-and-push-image-digest.mjs source',
  'build-and-push-ghcr:',
  'needs.prepare.outputs.has_image == \'true\'',
  'GHCR_IMAGE_REPOSITORY',
  'BUILD_ARGS_JSON',
  '上传镜像 digest',
  '下载镜像 digest',
  'pattern: image-digest-${{ steps.image-env.outputs.service_name }}--*',
  'merge-ghcr-manifest:',
  '合并 GHCR manifest',
  'docker buildx imagetools create',
  '${GHCR_IMAGE_REPOSITORY}:${IMAGE_TAG}',
  '${GHCR_IMAGE_REPOSITORY}:latest',
  'registry: ghcr.io',
  'docker/setup-buildx-action@v3',
  'runs-on: ${{ matrix.runner }}',
  'matrix: ${{ fromJSON(needs.prepare.outputs.image_matrix) }}',
  'has_npm',
  'npm_matrix',
  'release-npm-assets:',
  'prepare-npm-publish-input:',
  'release-github-release:',
  'release-npm:',
  'npm-publish-input',
  'npm_matrix',
  'upload-artifact',
  'download-artifact',
  '下载 npm 发布输入',
  'BUILD_ONLY: true',
  'gh release create',
  'gh release upload',
  '创建 GitHub Release',
  '上传 GitHub Release 资产',
  'github.repository',
  'node scripts/prepare-npm-publish-input.mjs source',
  'node scripts/build-npm-release-assets.mjs source',
  'node scripts/merge-desktop-manifest.mjs release-artifacts',
  'node scripts/merge-tauri-updater-json.mjs release-artifacts "${{ github.repository }}"',
  'node scripts/publish-npm-package.mjs',
  'NPM_DIST_TAG',
  'node-version: 24',
  'uses: ./.github/actions/checkout-source',
  'uses: actions/create-github-app-token@v3',
  'DEPLOY_CENTER_APP_CLIENT_ID',
  'DEPLOY_CENTER_APP_PRIVATE_KEY',
  'owner: ${{ steps.image-env.outputs.source_owner }}',
  'repositories: ${{ steps.image-env.outputs.source_repository_name }}',
  'permission-contents: read',
  'token: ${{ steps.source-token.outputs.token }}',
  'uses: ./.github/actions/setup-node-pnpm',
  'uses: ./.github/actions/print-runner-info',
  'actions/setup-go@v5',
  '检测 Go module 文件',
  'node scripts/detect-go-module.mjs source',
  "steps.detect-go-module.outputs.path != ''",
  'go-version-file: ${{ steps.detect-go-module.outputs.path }}',
  '安装 Tauri CLI',
  "steps.npm-env.outputs.npm_package_name == '@vino.tian/vibe-kanban' && matrix.target == 'darwin-arm64'",
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
  'npm-artifacts/${{ matrix.target }}/*.sig',
  'npm-artifacts/${{ matrix.target }}/*-desktop-manifest-fragment.json',
  'npm-artifacts/${{ matrix.target }}/*-tauri-updater-fragment.json',
]) {
  assertContains(file, pattern);
}

for (const pattern of ['ubuntu-24.04-arm', 'appendGithubOutputs', 'image_matrix']) {
  assertContains(workflowOutputScript, pattern);
}
for (const pattern of ['docker', 'buildx', 'build', 'containerimage.digest', 'GITHUB_OUTPUT', 'push-by-digest=true']) {
  assertContains(buildImageDigestScript, pattern);
}

for (const pattern of [
  'release_targets',
  'config/services.${source_repository_name}.json',
  'merge-image-manifest:',
  'docker/build-push-action@v6',
  'docker/setup-qemu-action',
  'node scripts/prepare-release-matrix.mjs --output=build',
  'node scripts/prepare-release-matrix.mjs --output=manifest',
  'fromJSON(needs.prepare.outputs.build_matrix)',
  'fromJSON(needs.prepare.outputs.manifest_matrix)',
  'pattern: image-digest-${{ matrix.service }}--*',
  '合并镜像 manifest',
  'if [ "${target}" = \'npm\' ]; then',
  'target_services="${target_services},${target}"',
  '缺少服务构建配置文件',
  'mirror-to-acr:',
  'update-candidate:',
  'deploy-test:',
  'npm_release_package_key',
  'npm_release_repository',
  'LEGACY_TARGET_SERVICES',
  /^      services:$/m,
  '--verify-tag',
  "matrix.target == 'linux-x64'",
  'release-npm-package.sh source',
  'toolchain: nightly-',
  'NODE_AUTH_TOKEN',
  'mapfile -t docker_build_args',
  'docker_build_args[@]',
  "node <<'NODE'",
  '/tmp/service-request.json',
  'shell: bash',
  'SOURCE_REPO_TOKEN',
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
]) {
  assertNotContains(file, pattern);
}

assert.equal(
  [...file.matchAll(/^      - uses: actions\/checkout@v6$/gm)].length,
  6,
  'actions/checkout@v6 次数不符合预期',
);
assertNotContains(
  validateWorkflow,
  /bash -n scripts\/|ruby -c scripts\/|ruby scripts\/prepare-release-matrix\.rb/,
  '部署配置校验 workflow 不应再依赖 Bash 或 Ruby 脚本校验。',
);

await assertFileNotExists('tests/release-workflow.sh');
