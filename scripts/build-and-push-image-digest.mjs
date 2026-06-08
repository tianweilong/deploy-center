#!/usr/bin/env node

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';
import { runCommand } from './npm-release-common.mjs';

function requireEnv(env, name) {
  const value = env[name];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`缺少环境变量：${name}`);
  }
  return String(value);
}

function parseBuildArgs(env) {
  return JSON.parse(env.BUILD_ARGS_JSON || '{}');
}

export function buildDockerBuildxArgs(env, metadataPath) {
  const buildArgs = parseBuildArgs(env);
  const args = [];
  for (const [key, value] of Object.entries(buildArgs)) {
    args.push('--build-arg', `${key}=${value}`);
  }

  args.push(
    '--label',
    `org.opencontainers.image.source=https://github.com/${requireEnv(env, 'SOURCE_REPOSITORY')}`,
    '--platform',
    requireEnv(env, 'PLATFORM'),
    '-f',
    requireEnv(env, 'DOCKERFILE_PATH'),
    '--output',
    `type=image,name=${requireEnv(env, 'GHCR_IMAGE_REPOSITORY')},push-by-digest=true,name-canonical=true,push=true`,
    '--metadata-file',
    metadataPath,
    requireEnv(env, 'BUILD_CONTEXT'),
  );

  return args;
}

async function readContainerImageDigest(metadataPath) {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  return metadata['containerimage.digest'] || '';
}

export async function buildAndPushImageDigest(sourceDir = 'source', env = process.env) {
  const outputPath = requireEnv(env, 'GITHUB_OUTPUT');
  const metadataPath = path.resolve(env.BUILD_METADATA_PATH || '.deploy-center/build-metadata.json');
  await mkdir(path.dirname(metadataPath), { recursive: true });

  await runCommand('docker', ['buildx', 'build', ...buildDockerBuildxArgs(env, metadataPath)], {
    cwd: sourceDir,
  });

  const digest = await readContainerImageDigest(metadataPath);
  if (!digest) {
    throw new Error('构建未返回镜像 digest。');
  }
  await appendFile(outputPath, `digest=${digest}\n`, 'utf8');
  return digest;
}

async function main() {
  const [sourceDir = 'source'] = process.argv.slice(2);
  await buildAndPushImageDigest(sourceDir);
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
