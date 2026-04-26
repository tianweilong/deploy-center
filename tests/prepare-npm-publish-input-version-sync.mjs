import assert from 'node:assert/strict';
import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { createTempDir, removeDir, repoRoot, runNode } from './helpers.mjs';

const tempRoot = await createTempDir('deploy-center-prepare-input-');
try {
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const sourceRoot = path.join(workspaceRoot, 'source');
  const outputRoot = path.join(sourceRoot, 'npm-publish-input');
  const fixtureSource = path.join(repoRoot, 'tests/fixtures/release-npm-package-source');

  await mkdir(workspaceRoot, { recursive: true });
  await cp(fixtureSource, sourceRoot, { recursive: true });

  runNode([path.join(repoRoot, 'scripts/prepare-npm-publish-input.mjs'), 'source'], {
    cwd: workspaceRoot,
    env: {
      OUTPUT_DIR: 'npm-publish-input',
      SOURCE_TAG: 'v0.1.4',
      NPM_PACKAGE_NAME: '@vino.tian/myte',
      NPM_PACKAGE_DIR: 'npm/myte',
      NPM_DIST_TAG: 'candidate',
      NPM_VERSION_STRATEGY: 'source_tag',
      TARGET_OS: 'linux',
      TARGET_ARCH: 'x64',
    },
  });

  const packageDir = path.join(outputRoot, 'package');
  const publishContext = JSON.parse(
    await readFile(path.join(outputRoot, 'publish-context.json'), 'utf8'),
  );
  const releaseMeta = JSON.parse(
    await readFile(path.join(packageDir, 'release-meta.json'), 'utf8'),
  );
  const cliBundle = await readFile(path.join(packageDir, 'bin', 'cli.js'), 'utf8');

  assert.equal(publishContext.publishTag, 'candidate');
  assert.equal(releaseMeta.packageVersion, '0.1.4');
  assert.equal(releaseMeta.releaseTag, 'myte-v0.1.4');
  assert.match(cliBundle, /"packageVersion":"0\.1\.4"/);
  assert.match(cliBundle, /"releasePackageVersion":"0\.1\.4"/);
  assert.match(cliBundle, /"releaseTag":"myte-v0\.1\.4"/);
} finally {
  await removeDir(tempRoot);
}
