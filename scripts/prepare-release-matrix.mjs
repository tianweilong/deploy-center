#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

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

export async function buildReleaseMatrix(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const requestedServices = readRequestedServices();
  const sourceTag = process.env.SOURCE_TAG;
  const defaultImagePlatforms = (process.env.DEFAULT_IMAGE_PLATFORMS ?? '').trim();
  const serviceMap = new Map(
    config.services.map((service) => [service.service, service]),
  );

  const includeItems = requestedServices.map((serviceName) => {
    const service = serviceMap.get(serviceName);
    if (!service) {
      throw new Error(`不支持的服务：${serviceName}`);
    }

    return {
      service: service.service,
      image_repository: service.image_repository,
      context: service.context,
      dockerfile: service.dockerfile,
      platforms: resolvePlatforms(service, defaultImagePlatforms),
      build_args: resolveBuildArgs(service),
      tag: sourceTag,
    };
  });

  return { include: includeItems };
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error(
      '用法：node scripts/prepare-release-matrix.mjs <config-path>',
    );
  }

  if (!process.env.TARGET_SERVICES) {
    throw new Error('缺少 TARGET_SERVICES');
  }
  if (!process.env.SOURCE_TAG) {
    throw new Error('缺少 SOURCE_TAG');
  }

  const matrix = await buildReleaseMatrix(configPath);
  process.stdout.write(`${JSON.stringify(matrix)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
