import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createTempDir, removeDir, runNode, writeTempFile } from './helpers.mjs';

function parseGithubOutput(content) {
  const outputs = {};
  for (const line of content.trim().split('\n')) {
    if (!line) {
      continue;
    }
    const separator = line.indexOf('=');
    assert.notEqual(separator, -1, `输出行缺少 =：${line}`);
    outputs[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return outputs;
}

test('write-release-workflow-output npm-env 从环境变量写入 GitHub outputs', async () => {
  const tempDir = await createTempDir('deploy-center-output-');
  try {
    const outputPath = path.join(tempDir, 'github-output.txt');
    const serviceRequest = {
      service_name: 'myte',
      source_repository: 'tianweilong/myte',
      npm_package_name: '@vino.tian/myte',
      npm_package_dir: 'npm/myte',
      npm_dist_tag: 'latest',
      npm_version_strategy: 'calendar_tag',
    };

    runNode(['scripts/write-release-workflow-output.mjs', 'npm-env'], {
      env: {
        SERVICE_REQUEST: JSON.stringify(serviceRequest),
        GITHUB_OUTPUT: outputPath,
      },
    });

    assert.deepEqual(parseGithubOutput(await readFile(outputPath, 'utf8')), {
      source_repository: 'tianweilong/myte',
      source_owner: 'tianweilong',
      source_repository_name: 'myte',
      npm_package_name: '@vino.tian/myte',
      npm_package_dir: 'npm/myte',
      npm_dist_tag: 'latest',
      npm_version_strategy: 'calendar_tag',
    });
  } finally {
    await removeDir(tempDir);
  }
});

test('write-release-workflow-output prepare 解析配置并写入矩阵与服务请求', async () => {
  const tempDir = await createTempDir('deploy-center-output-');
  try {
    const outputPath = path.join(tempDir, 'github-output.txt');
    const configPath = path.join(tempDir, 'services.yaml');
    await writeTempFile(
      configPath,
      `services:\n  myte:\n    sourceRepository: tianweilong/myte\n    releaseEvent: deploy-center-release\n    releaseType: npm\n    npmPackageName: '@vino.tian/myte'\n    npmPackageDir: npm/myte\n    npmVersionStrategy: calendar_tag\n    npmDistTag: latest\n    npmPlatforms:\n      - runner: windows-latest\n        target: win32-x64\n        targetOs: win32\n        targetArch: x64\n        archiveExt: zip\n`,
    );

    runNode(['scripts/write-release-workflow-output.mjs', 'prepare'], {
      env: {
        SERVICE_NAME: 'myte',
        SOURCE_REF: 'refs/tags/v2026.6.8-t1542',
        SOURCE_SHA: '18e78ae5e965dca2f1a88bb1120d9a601ede3211',
        SOURCE_TAG: 'v2026.6.8-t1542',
        BUILD_DATE: '2026-06-08T07:44:00Z',
        DEPLOY_CENTER_SERVICES_CONFIG: configPath,
        GITHUB_OUTPUT: outputPath,
      },
    });

    const content = await readFile(outputPath, 'utf8');
    assert.match(content, /^service_request<<EOF\n/m);
    assert.match(content, /\nhas_image=false\n/);
    assert.match(content, /\nhas_npm=true\n/);
    const outputs = parseGithubOutput(
      content.replace(/^service_request<<EOF\n[\s\S]*?\nEOF\n/m, ''),
    );
    assert.deepEqual(JSON.parse(outputs.npm_matrix), {
      include: [
        {
          runner: 'windows-latest',
          target: 'win32-x64',
          target_os: 'win32',
          target_arch: 'x64',
          archive_ext: 'zip',
        },
      ],
    });
  } finally {
    await removeDir(tempDir);
  }
});
