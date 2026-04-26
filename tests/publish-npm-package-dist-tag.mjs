import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTempDir, removeDir, repoRoot, runNode } from './helpers.mjs';

async function installNpmStub(tempRoot) {
  const binDir = path.join(tempRoot, 'bin');
  const logFile = path.join(tempRoot, 'npm.log');
  const stubPath = path.join(binDir, 'npm');
  await mkdir(binDir, { recursive: true });
  await writeFile(
    stubPath,
    `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const logFile = process.env.NPM_STUB_LOG;
const [command, ...args] = process.argv.slice(2);
appendFileSync(logFile, JSON.stringify({ command, args, cwd: process.cwd() }) + '\\n');

if (command === 'pack') {
  writeFileSync(path.join(process.cwd(), 'vino.tian-myte-0.1.4.tgz'), 'tgz');
  process.exit(0);
}

if (command === 'view') {
  process.exit(1);
}

process.exit(0);
`,
    'utf8',
  );
  await chmod(stubPath, 0o755);
  return { binDir, logFile };
}

async function createPublishInput(tempRoot, publishTag) {
  const inputDir = path.join(tempRoot, 'npm-publish-input');
  const packageDir = path.join(inputDir, 'package');
  await mkdir(path.join(packageDir, 'scripts'), { recursive: true });
  await writeFile(
    path.join(inputDir, 'manifest.txt'),
    'package/package.json\n',
    'utf8',
  );
  await writeFile(
    path.join(inputDir, 'publish-context.json'),
    `${JSON.stringify(
      {
        packageName: '@vino.tian/myte',
        publishVersion: '0.1.4',
        publishTag,
        packageDir: 'package',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(
    path.join(packageDir, 'package.json'),
    `${JSON.stringify({ name: '@vino.tian/myte', version: '0.0.1' }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(packageDir, 'scripts', 'prepare-publish.mjs'),
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';

writeFileSync(path.join(process.cwd(), 'prepare-publish-ran.txt'), 'ok');
`,
    'utf8',
  );
  return inputDir;
}

async function runPublish(tempRoot, publishTag) {
  const { binDir, logFile } = await installNpmStub(tempRoot);
  const inputDir = await createPublishInput(tempRoot, publishTag);
  runNode([path.join(repoRoot, 'scripts/publish-npm-package.mjs'), inputDir], {
    cwd: tempRoot,
    env: {
      PATH: `${binDir}:${process.env.PATH}`,
      NPM_STUB_LOG: logFile,
    },
  });
  return (await readFile(logFile, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('publish-npm-package 在 publishTag 存在时附加 --tag', async () => {
  const tempRoot = await createTempDir('deploy-center-publish-tag-');
  try {
    const commands = await runPublish(tempRoot, 'candidate');
    const publishCommand = commands.find((entry) => entry.command === 'publish');

    assert.ok(publishCommand, '期望执行 npm publish');
    assert.deepEqual(publishCommand.args, [
      'vino.tian-myte-0.1.4.tgz',
      '--access',
      'public',
      '--tag',
      'candidate',
    ]);
  } finally {
    await removeDir(tempRoot);
  }
});

test('publish-npm-package 在 publishTag 为空时保持默认 latest', async () => {
  const tempRoot = await createTempDir('deploy-center-publish-latest-');
  try {
    const commands = await runPublish(tempRoot, '');
    const publishCommand = commands.find((entry) => entry.command === 'publish');

    assert.ok(publishCommand, '期望执行 npm publish');
    assert.deepEqual(publishCommand.args, [
      'vino.tian-myte-0.1.4.tgz',
      '--access',
      'public',
    ]);
  } finally {
    await removeDir(tempRoot);
  }
});

test('publish-npm-package 在发布输入已预构建时跳过 prepack 并显式执行 prepare-publish', async () => {
  const tempRoot = await createTempDir('deploy-center-publish-ignore-scripts-');
  try {
    const { binDir, logFile } = await installNpmStub(tempRoot);
    const inputDir = await createPublishInput(tempRoot, 'candidate');
    runNode([path.join(repoRoot, 'scripts/publish-npm-package.mjs'), inputDir], {
      cwd: tempRoot,
      env: {
        PATH: `${binDir}:${process.env.PATH}`,
        NPM_STUB_LOG: logFile,
      },
    });

    const commands = (await readFile(logFile, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const packCommand = commands.find((entry) => entry.command === 'pack');

    assert.ok(packCommand, '期望执行 npm pack');
    assert.deepEqual(packCommand.args, ['--ignore-scripts']);
    await readFile(
      path.join(inputDir, 'package', 'prepare-publish-ran.txt'),
      'utf8',
    );
  } finally {
    await removeDir(tempRoot);
  }
});
