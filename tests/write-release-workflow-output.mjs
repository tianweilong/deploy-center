import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createTempDir, removeDir, repoRoot, runNode, writeTempFile } from './helpers.mjs';

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

test('write-release-workflow-output 使用真实配置准备 postgres18 双架构镜像发布', async () => {
  const tempDir = await createTempDir('deploy-center-postgres18-output-');
  try {
    const outputPath = path.join(tempDir, 'github-output.txt');
    const sourceRef = 'refs/tags/v2026.10.5-t1526';
    const sourceSha = '82b71e0422eae6a80212d71da05e97a4b37f2e07';
    const sourceTag = 'v2026.10.5-t1526';

    runNode(['scripts/write-release-workflow-output.mjs', 'prepare'], {
      env: {
        SERVICE_NAME: 'postgres18',
        SOURCE_REF: sourceRef,
        SOURCE_SHA: sourceSha,
        SOURCE_TAG: sourceTag,
        DEPLOY_CENTER_SERVICES_CONFIG: path.join(repoRoot, 'config/services.yaml'),
        GITHUB_OUTPUT: outputPath,
      },
    });

    const content = await readFile(outputPath, 'utf8');
    const requestOutput = content.match(/^service_request<<EOF\n([\s\S]*?)\nEOF\n/m);
    assert.ok(requestOutput, '必须输出供构建任务消费的服务请求');
    const request = JSON.parse(requestOutput[1]);
    assert.deepEqual(request, {
      service_name: 'postgres18',
      source_repository: 'tianweilong/docker-mirror',
      source_ref: sourceRef,
      source_sha: sourceSha,
      source_tag: sourceTag,
      image_tag: sourceTag,
      has_image: true,
      has_npm: false,
      build_context: 'images/postgres18',
      dockerfile_path: 'images/postgres18/Dockerfile',
      ghcr_image_repository: 'ghcr.io/tianweilong/postgres18',
      platforms: ['linux/amd64', 'linux/arm64'],
      build_args: {},
    });
    const outputs = parseGithubOutput(content.replace(requestOutput[0], ''));
    assert.equal(outputs.has_image, 'true');
    assert.equal(outputs.has_npm, 'false');
    assert.deepEqual(JSON.parse(outputs.image_matrix), {
      include: [
        { platform: 'linux/amd64', platform_pair: 'linux-amd64', runner: 'ubuntu-latest' },
        { platform: 'linux/arm64', platform_pair: 'linux-arm64', runner: 'ubuntu-24.04-arm' },
      ],
    });
    assert.deepEqual(JSON.parse(outputs.npm_matrix), { include: [] });

    const imageOutputPath = path.join(tempDir, 'image-output.txt');
    runNode(['scripts/write-release-workflow-output.mjs', 'image-env'], {
      env: {
        SERVICE_REQUEST: JSON.stringify(request),
        GITHUB_OUTPUT: imageOutputPath,
      },
    });
    assert.deepEqual(parseGithubOutput(await readFile(imageOutputPath, 'utf8')), {
      service_name: 'postgres18',
      source_repository: 'tianweilong/docker-mirror',
      source_owner: 'tianweilong',
      source_repository_name: 'docker-mirror',
      build_context: 'images/postgres18',
      dockerfile_path: 'images/postgres18/Dockerfile',
      ghcr_image_repository: 'ghcr.io/tianweilong/postgres18',
      image_tag: sourceTag,
      build_args_json: '{}',
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
