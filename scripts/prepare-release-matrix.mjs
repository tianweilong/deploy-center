#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { isMainModule } from './module-entrypoint.mjs';

const releaseTagPattern = /^v\d{4}\.\d{1,2}\.\d{1,2}-\d{4}$/;

function readRequestedServices() {
  return process.env.TARGET_SERVICES.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
}

function resolveBuildArgs(service) {
  return service.build_args.map((buildArg) => {
    const envName = buildArg.env;
    const value = process.env[envName] ?? '';
    if (value.length === 0 || value.startsWith('CHANGE_ME')) {
      throw new Error(`缺少必填构建参数环境变量：${envName}`);
    }

    return `${buildArg.name}=${value}`;
  });
}

function resolvePlatforms(service, defaultImagePlatforms) {
  const platforms = String(service.platforms ?? '').trim();
  if (platforms.length > 0) {
    return platforms;
  }
  if (defaultImagePlatforms.length === 0) {
    throw new Error('缺少默认镜像平台配置：DEFAULT_IMAGE_PLATFORMS');
  }
  return defaultImagePlatforms;
}

function resolvePlatformList(service, defaultImagePlatforms) {
  const platforms = resolvePlatforms(service, defaultImagePlatforms)
    .split(',')
    .map((platform) => platform.trim())
    .filter(Boolean)
    .filter((platform, index, platforms) => platforms.indexOf(platform) === index);

  if (platforms.length === 0) {
    throw new Error(`服务 ${service.service} 没有可构建平台`);
  }

  return platforms;
}

function resolvePlatformRunner(platform) {
  if (platform === 'linux/amd64') {
    return 'ubuntu-latest';
  }
  if (platform === 'linux/arm64') {
    return 'ubuntu-24.04-arm';
  }

  throw new Error(`不支持的镜像平台：${platform}`);
}

function toPlatformPair(platform) {
  return platform.replaceAll('/', '-');
}

function createBuildMatrixItems(serviceItem, platforms) {
  return platforms.map((platform) => {
    const platformPair = toPlatformPair(platform);

    return {
      ...serviceItem,
      platform,
      platform_pair: platformPair,
      runner: resolvePlatformRunner(platform),
      digest_artifact_name: `image-digest-${serviceItem.service}--${platformPair}`,
    };
  });
}

export async function buildReleaseMatrix(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const requestedServices = readRequestedServices();
  const sourceTag = process.env.SOURCE_TAG;
  const defaultImagePlatforms = (process.env.DEFAULT_IMAGE_PLATFORMS ?? '').trim();
  const serviceMap = new Map(
    config.services.map((service) => [service.service, service]),
  );

  const buildIncludeItems = [];
  const includeItems = requestedServices.map((serviceName) => {
    const service = serviceMap.get(serviceName);
    if (!service) {
      throw new Error(`不支持的服务：${serviceName}`);
    }

    const platforms = resolvePlatformList(service, defaultImagePlatforms);
    const serviceItem = {
      service: service.service,
      image_repository: service.image_repository,
      context: service.context,
      dockerfile: service.dockerfile,
      platforms: platforms.join(','),
      build_args: resolveBuildArgs(service),
      tag: sourceTag,
    };

    buildIncludeItems.push(...createBuildMatrixItems(serviceItem, platforms));

    return serviceItem;
  });

  return { include: includeItems, build_include: buildIncludeItems };
}

function parseArgs(args) {
  let output = 'manifest';
  let configPath;

  for (const arg of args) {
    if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
      continue;
    }

    if (!configPath) {
      configPath = arg;
      continue;
    }

    throw new Error(`未知参数：${arg}`);
  }

  if (!['all', 'build', 'manifest'].includes(output)) {
    throw new Error(`不支持的输出类型：${output}`);
  }

  return { configPath, output };
}

function selectOutput(matrix, output) {
  if (output === 'all') {
    return matrix;
  }
  if (output === 'build') {
    return { include: matrix.build_include };
  }

  return { include: matrix.include };
}

async function main() {
  const { configPath, output } = parseArgs(process.argv.slice(2));
  if (!configPath) {
    throw new Error(
      '用法：node scripts/prepare-release-matrix.mjs [--output=manifest|build|all] <config-path>',
    );
  }

  if (!process.env.TARGET_SERVICES) {
    throw new Error('缺少 TARGET_SERVICES');
  }
  if (!process.env.SOURCE_TAG) {
    throw new Error('缺少 SOURCE_TAG');
  }
  if (!releaseTagPattern.test(process.env.SOURCE_TAG)) {
    throw new Error('SOURCE_TAG 必须匹配 vYYYY.M.D-HHmm');
  }

  const matrix = await buildReleaseMatrix(configPath);
  process.stdout.write(`${JSON.stringify(selectOutput(matrix, output))}\n`);
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
