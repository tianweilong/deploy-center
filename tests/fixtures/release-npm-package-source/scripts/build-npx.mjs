import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const targetOs = process.env.TARGET_OS;
const targetArch = process.env.TARGET_ARCH;

if (targetOs !== 'linux' || targetArch !== 'x64') {
  throw new Error(`测试 fixture 仅支持 linux/x64，收到 ${targetOs}/${targetArch}`);
}

const distDir = path.join('npm', 'myte', 'dist', 'linux-x64');
await mkdir(distDir, { recursive: true });
await writeFile(path.join(distDir, 'myte'), 'fixture-binary\n');
await writeFile(
  path.join(distDir, 'manifest.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      packageName: '@vino.tian/myte',
      platform: 'linux-x64',
      targetOs: 'linux',
      targetArch: 'x64',
      files: ['myte'],
    },
    null,
    2,
  ) + '\n',
);
