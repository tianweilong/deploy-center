import assert from 'node:assert/strict';

import {
  assertContains,
  assertFileExists,
  assertFileNotExists,
  assertNotContains,
  readRepoFile,
} from './helpers.mjs';

const workflow = await readRepoFile('.github/workflows/release-service.yml');
const serviceConfig = await readRepoFile('config/services.yaml');
const commonScript = await readRepoFile('scripts/npm-release-common.mjs');
const prepareScript = await readRepoFile('scripts/prepare-npm-publish-input.mjs');
const assetsScript = await readRepoFile('scripts/build-npm-release-assets.mjs');
const mergeDesktopManifestScript = await readRepoFile(
  'scripts/merge-desktop-manifest.mjs',
);
const mergeTauriUpdaterScript = await readRepoFile(
  'scripts/merge-tauri-updater-json.mjs',
);
const publishScript = await readRepoFile('scripts/publish-npm-package.mjs');
const githubOutputScript = await readRepoFile('scripts/write-release-workflow-output.mjs');
const buildImageDigestScript = await readRepoFile('scripts/build-and-push-image-digest.mjs');
const detectGoModuleScript = await readRepoFile('scripts/detect-go-module.mjs');

const workflowLines = workflow.split('\n');

function findJobBlock(jobName) {
  const start = workflowLines.findIndex((line) => line === `  ${jobName}:`);
  assert.notEqual(start, -1, `未找到 workflow job：${jobName}`);

  let end = workflowLines.length;
  for (let index = start + 1; index < workflowLines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:$/.test(workflowLines[index])) {
      end = index;
      break;
    }
  }

  return workflowLines.slice(start, end).join('\n');
}

function findStepBlock(jobBlock, stepName) {
  const lines = jobBlock.split('\n');
  const start = lines.findIndex((line) => line.trim() === `name: ${stepName}`);
  assert.notEqual(start, -1, `未找到 workflow step：${stepName}`);

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^      - /.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

const releaseNpmAssetsJob = findJobBlock('release-npm-assets');
const releaseNpmAssetsEnvStep = findStepBlock(
  releaseNpmAssetsJob,
  '解析 npm 发布环境',
);
assertContains(
  releaseNpmAssetsEnvStep,
  'node scripts/write-release-workflow-output.mjs npm-env',
  'release-npm-assets 的解析 npm 发布环境步骤会在 Windows matrix 上运行，必须使用跨平台 MJS 写 GITHUB_OUTPUT。',
);
assertNotContains(
  workflow,
  "node <<'NODE'",
  'release-service.yml 不应保留 inline Node heredoc，避免 Bash/pwsh 和 Windows 路径差异。',
);
assertNotContains(
  workflow,
  'shell: bash',
  'release-service.yml 不应依赖 Bash shell 处理 npm 发布路径，避免 Windows matrix 路径差异。',
);

await assertFileNotExists('scripts/release-npm-package.sh');
await assertFileNotExists('scripts/prepare-release-matrix.rb');
await assertFileExists('scripts/prepare-npm-publish-input.mjs');
await assertFileExists('scripts/build-npm-release-assets.mjs');
await assertFileExists('scripts/merge-desktop-manifest.mjs');
await assertFileExists('scripts/merge-tauri-updater-json.mjs');
await assertFileExists('scripts/publish-npm-package.mjs');
await assertFileExists('scripts/write-release-workflow-output.mjs');
await assertFileExists('scripts/build-and-push-image-digest.mjs');
await assertFileExists('scripts/detect-go-module.mjs');

for (const pattern of [
  "needs.prepare.outputs.has_npm == 'true'",
  'npm_package_name',
  'npm_dist_tag',
  'release-npm-assets:',
  'prepare-npm-publish-input:',
  'release-github-release:',
  'release-npm:',
  'npm-publish-input',
  'node scripts/prepare-npm-publish-input.mjs source',
  'node scripts/build-npm-release-assets.mjs source',
  'node scripts/merge-desktop-manifest.mjs release-artifacts',
  'node scripts/merge-tauri-updater-json.mjs release-artifacts "${{ github.repository }}"',
  'node scripts/publish-npm-package.mjs',
  'node scripts/write-release-workflow-output.mjs prepare',
  'node scripts/write-release-workflow-output.mjs image-env',
  'node scripts/write-release-workflow-output.mjs npm-env',
  'node scripts/write-release-workflow-output.mjs npm-github-release-env',
  'node scripts/build-and-push-image-digest.mjs source',
  'node-version: 24',
  'uses: ./.github/actions/setup-node-pnpm',
  'uses: ./.github/actions/checkout-source',
  'actions/setup-go@v5',
  'node scripts/detect-go-module.mjs source',
  'go-version-file: ${{ steps.detect-go-module.outputs.path }}',
  "steps.detect-go-module.outputs.path != ''",
  'go-version-file: ${{ steps.detect-go-module.outputs.path }}',
  '安装 Tauri CLI',
  "steps.npm-env.outputs.npm_package_name == '@vino.tian/vibe-kanban' && matrix.target == 'darwin-arm64'",
  "cargo install tauri-cli --version '^2' --locked",
  'lockfile-path: source/pnpm-lock.yaml',
  'pnpm-version: 10.13.1',
  'npm-version: 11.5.1',
  "hashFiles('source/rust-toolchain.toml', 'source/rust-toolchain') != ''",
  'path: |',
  'npm-artifacts/${{ matrix.target }}/*.${{ matrix.archive_ext }}',
  'npm-artifacts/${{ matrix.target }}/*-checksums.txt',
  'npm-artifacts/${{ matrix.target }}/*.app.tar.gz',
  'npm-artifacts/${{ matrix.target }}/*.AppImage.tar.gz',
  'npm-artifacts/${{ matrix.target }}/*-setup.exe',
  'npm-artifacts/${{ matrix.target }}/*.sig',
  'npm-artifacts/${{ matrix.target }}/*-desktop-manifest-fragment.json',
  'npm-artifacts/${{ matrix.target }}/*-tauri-updater-fragment.json',
  'BUILD_ARTIFACT_DIR: ../npm-artifacts/${{ matrix.target }}',
  'BUILD_DESKTOP_BUNDLE:',
  'DESKTOP_RELEASE_MODE:',
  'NPM_PACKAGE_NAME: ${{ steps.npm-env.outputs.npm_package_name }}',
  'NPM_PACKAGE_DIR: ${{ steps.npm-env.outputs.npm_package_dir }}',
  'NPM_VERSION_STRATEGY: ${{ steps.npm-env.outputs.npm_version_strategy }}',
  'NPM_DIST_TAG: ${{ steps.npm-env.outputs.npm_dist_tag }}',
  'id-token: write',
  'uses: actions/create-github-app-token@v3',
  'DEPLOY_CENTER_APP_CLIENT_ID',
  'DEPLOY_CENTER_APP_PRIVATE_KEY',
  'token: ${{ steps.source-token.outputs.token }}',
  'gh release create',
  'node scripts/merge-release-checksums.mjs release-artifacts',
]) {
  assertContains(workflow, pattern);
}

for (const pattern of [
  'vibe-kanban-npm:',
  'npmVersionStrategy: calendar_tag',
  'npmDistTag: latest',
]) {
  assertContains(serviceConfig, pattern);
}

assert.equal(
  [...workflow.matchAll(/^      - uses: actions\/checkout@v6$/gm)].length,
  7,
  'actions/checkout@v6 次数不符合预期',
);

for (const pattern of [
  'github.event.client_payload.npm_package_name',
  'inputs.npm_package_name',
  'NPM_BASE_VERSION_FILE',
  'NPM_VERSION_PATCH_FACTOR',
  'release-npm-package.sh source',
  'toolchain: nightly-',
  'path: npm-artifacts/${{ matrix.target }}',
  'NODE_AUTH_TOKEN',
  'SOURCE_REPO_TOKEN',
  'registry-url: https://registry.npmjs.org',
  'TAURI_SIGNING_PRIVATE_KEY:',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD:',
  'TAURI_UPDATE_ENDPOINT:',
]) {
  assertNotContains(workflow, pattern);
}

for (const pattern of [
  "from './npm-release-common.mjs'",
  'publish-context.json',
  'manifest.txt',
  'release-meta.json',
  'package/',
  'publishTag',
]) {
  assertContains(prepareScript, pattern);
}

for (const pattern of [
  "from './npm-release-common.mjs'",
  'validate-npm-build-contract.mjs',
  'checksums.txt',
  'desktop-manifest-fragment.json',
  'tauri-updater-fragment.json',
  'buildTauriUpdaterFragment',
  'BUILD_DESKTOP_BUNDLE',
  'DESKTOP_RELEASE_MODE',
]) {
  assertContains(assetsScript, pattern);
}
assertContains(commonScript, "createHash('sha256')");
assertNotContains(assetsScript, 'npm publish');

for (const pattern of [
  'appendGithubOutputs',
  'SERVICE_REQUEST',
  'GITHUB_OUTPUT',
  'image_matrix',
  'npm_matrix',
  'npm_package_name',
]) {
  assertContains(githubOutputScript, pattern);
}

for (const pattern of ['BUILD_ARGS_JSON', '--build-arg', 'containerimage.digest']) {
  assertContains(buildImageDigestScript, pattern);
}

for (const pattern of ['detectGoModule', 'GITHUB_OUTPUT']) {
  assertContains(detectGoModuleScript, pattern);
}

for (const pattern of [
  'desktop-manifest-fragment.json',
  'desktop-manifest.json',
  'platforms',
]) {
  assertContains(mergeDesktopManifestScript, pattern);
}

for (const pattern of [
  'tauri-updater-fragment.json',
  'updater.json',
  'releases/download',
  'packageKey',
  'signature',
]) {
  assertContains(mergeTauriUpdaterScript, pattern);
}

for (const pattern of [
  "from './npm-release-common.mjs'",
  'publish-context.json',
  'manifest.txt',
  'prepare-publish.mjs',
  "runCommand('node', [preparePublishScriptPath]",
  "runCommand('npm', ['pack', '--ignore-scripts']",
  "runCommand('npm', publishArgs",
  'package.json',
  'publishContext.publishTag',
  "'--tag'",
  'const publishArgs =',
]) {
  assertContains(publishScript, pattern);
}

for (const pattern of [
  'pnpm i --frozen-lockfile',
  'pnpm run build:npx',
  'release-npm-package.sh',
  'NODE_AUTH_TOKEN',
  '--provenance',
  './npx-cli/package.json',
]) {
  assertNotContains(publishScript, pattern);
}

for (const pattern of [
  'Compress-Archive',
  'tar -a -cf',
  'powershell.exe',
  'shasum -a 256',
]) {
  assertNotContains(commonScript, pattern);
}

await assertFileNotExists('tests/npm-release-workflow.sh');
