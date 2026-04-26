import assert from 'node:assert/strict';

import {
  assertContains,
  assertFileExists,
  assertFileNotExists,
  assertNotContains,
  readRepoFile,
} from './helpers.mjs';

const workflow = await readRepoFile('.github/workflows/release-service.yml');
const commonScript = await readRepoFile('scripts/npm-release-common.mjs');
const prepareScript = await readRepoFile('scripts/prepare-npm-publish-input.mjs');
const assetsScript = await readRepoFile('scripts/build-npm-release-assets.mjs');
const mergeDesktopManifestScript = await readRepoFile(
  'scripts/merge-desktop-manifest.mjs',
);
const publishScript = await readRepoFile('scripts/publish-npm-package.mjs');

await assertFileNotExists('scripts/release-npm-package.sh');
await assertFileNotExists('scripts/prepare-release-matrix.rb');
await assertFileExists('scripts/prepare-npm-publish-input.mjs');
await assertFileExists('scripts/build-npm-release-assets.mjs');
await assertFileExists('scripts/merge-desktop-manifest.mjs');
await assertFileExists('scripts/publish-npm-package.mjs');

for (const pattern of [
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
  'node scripts/publish-npm-package.mjs',
  'linux-arm64',
  'windows-latest',
  'darwin-arm64',
  'node-version: 24',
  'uses: ./.github/actions/setup-node-pnpm',
  'uses: ./.github/actions/checkout-source',
  'actions/setup-go@v5',
  "hashFiles('source/go/go.mod') != ''",
  'go-version-file: source/go/go.mod',
  '安装 Tauri CLI',
  "env.NPM_PACKAGE_NAME == '@vino.tian/vibe-kanban' && matrix.target == 'darwin-arm64'",
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
  'npm-artifacts/${{ matrix.target }}/*-desktop-manifest-fragment.json',
  'BUILD_ARTIFACT_DIR: ../npm-artifacts/${{ matrix.target }}',
  'BUILD_DESKTOP_BUNDLE:',
  'DESKTOP_RELEASE_MODE:',
  'id-token: write',
  'gh release create',
  'node scripts/merge-release-checksums.mjs release-artifacts',
]) {
  assertContains(workflow, pattern);
}

assert.equal(
  [...workflow.matchAll(/^      - uses: actions\/checkout@v6$/gm)].length,
  6,
  'actions/checkout@v6 次数不符合预期',
);

for (const pattern of [
  "matrix.target == 'linux-x64'",
  'release-npm-package.sh source',
  'toolchain: nightly-',
  'path: npm-artifacts/${{ matrix.target }}',
  'NODE_AUTH_TOKEN',
  'registry-url: https://registry.npmjs.org',
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
  'BUILD_DESKTOP_BUNDLE',
  'DESKTOP_RELEASE_MODE',
]) {
  assertContains(assetsScript, pattern);
}
assertContains(commonScript, "createHash('sha256')");
assertNotContains(assetsScript, 'npm publish');

for (const pattern of [
  'desktop-manifest-fragment.json',
  'desktop-manifest.json',
  'platforms',
]) {
  assertContains(mergeDesktopManifestScript, pattern);
}

for (const pattern of [
  "from './npm-release-common.mjs'",
  'publish-context.json',
  'manifest.txt',
  "runCommand('npm', ['pack']",
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
