import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const targetOs = process.env.TARGET_OS;
const targetArch = process.env.TARGET_ARCH;
const buildMode = process.argv.slice(2).find((arg) => arg === '--desktop') ?? null;

const packageDir = path.join('npm', 'myte');
await mkdir(path.join(packageDir, 'bin'), { recursive: true });

async function writePlatformContract({
  platformDir,
  platform,
  targetOs,
  targetArch,
}) {
  await mkdir(platformDir, { recursive: true });
  await writeFile(path.join(platformDir, 'myte'), 'fixture-binary\n');
  await writeFile(
    path.join(platformDir, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        packageName: '@vino.tian/myte',
        platform,
        targetOs,
        targetArch,
        files: ['myte'],
      },
      null,
      2,
    ) + '\n',
  );
}

if (targetOs === 'linux' && targetArch === 'x64') {
  await writePlatformContract({
    platformDir: path.join(packageDir, 'dist', 'linux-x64'),
    platform: 'linux-x64',
    targetOs: 'linux',
    targetArch: 'x64',
  });
} else if (targetOs === 'darwin' && targetArch === 'arm64') {
  await writePlatformContract({
    platformDir: path.join(packageDir, 'dist', 'macos-arm64'),
    platform: 'macos-arm64',
    targetOs: 'darwin',
    targetArch: 'arm64',
  });

  if (buildMode === '--desktop') {
    const tauriDir = path.join(packageDir, 'dist', 'tauri', 'darwin-aarch64');
    await mkdir(tauriDir, { recursive: true });
    await writeFile(path.join(tauriDir, 'Myte.app.tar.gz'), 'desktop-bundle\n');
  }
} else {
  throw new Error(
    `测试 fixture 仅支持 linux/x64 或 darwin/arm64，收到 ${targetOs}/${targetArch}`,
  );
}

const packageJson = JSON.parse(
  await readFile(path.join(packageDir, 'package.json'), 'utf8'),
);
const releaseMeta = JSON.parse(
  await readFile(path.join(packageDir, 'release-meta.json'), 'utf8'),
);

await writeFile(
  path.join(packageDir, 'bin', 'cli.js'),
  [
    '#!/usr/bin/env node',
    `module.exports = ${JSON.stringify({
      packageVersion: packageJson.version,
      releasePackageVersion: releaseMeta.packageVersion,
      releaseTag: releaseMeta.releaseTag,
    })};`,
    '',
  ].join('\n'),
);
