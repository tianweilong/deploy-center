#!/usr/bin/env node

import { appendFile, readFile } from 'node:fs/promises';
import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';
import {
  parseSimpleYaml,
  resolveReleaseRequest,
} from './resolve-release-request.mjs';

function requireEnv(env, name) {
  const value = env[name];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`缺少环境变量：${name}`);
  }
  return String(value);
}

function splitRepository(repository) {
  const [owner, name] = repository.split('/');
  if (!owner || !name) {
    throw new Error(`仓库名 ${repository} 不符合 owner/name 格式。`);
  }
  return { owner, name };
}

function appendOutputLine(lines, key, value) {
  if (value === undefined || value === null) {
    return;
  }
  lines.push(`${key}=${String(value)}`);
}

function appendMultilineOutput(lines, key, value) {
  lines.push(`${key}<<EOF`);
  lines.push(value);
  lines.push('EOF');
}

export async function appendGithubOutputs(outputs, outputPath) {
  const lines = [];
  for (const [key, value] of Object.entries(outputs)) {
    if (typeof value === 'string' && value.includes('\n')) {
      appendMultilineOutput(lines, key, value);
      continue;
    }
    appendOutputLine(lines, key, value);
  }

  if (lines.length === 0) {
    return;
  }
  await appendFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function buildImageMatrix(request) {
  const runnerForPlatform = (platform) => {
    if (platform === 'linux/amd64') return 'ubuntu-latest';
    if (platform === 'linux/arm64') return 'ubuntu-24.04-arm';
    throw new Error(`不支持的镜像平台：${platform}`);
  };

  return {
    include: request.has_image
      ? request.platforms.map((platform) => ({
          platform,
          platform_pair: platform.replaceAll('/', '-'),
          runner: runnerForPlatform(platform),
        }))
      : [],
  };
}

function buildPreparePayload(env) {
  return {
    service_name: requireEnv(env, 'SERVICE_NAME'),
    source_ref: requireEnv(env, 'SOURCE_REF'),
    source_sha: requireEnv(env, 'SOURCE_SHA'),
    source_tag: requireEnv(env, 'SOURCE_TAG'),
  };
}

async function resolvePrepareRequest(env) {
  const configPath = env.DEPLOY_CENTER_SERVICES_CONFIG || 'config/services.yaml';
  const config = parseSimpleYaml(await readFile(configPath, 'utf8'));
  return resolveReleaseRequest(config, buildPreparePayload(env), {
    buildDate: env.BUILD_DATE,
  });
}

function parseServiceRequest(env) {
  return JSON.parse(requireEnv(env, 'SERVICE_REQUEST'));
}

function buildSourceRepositoryOutputs(request) {
  const { owner, name } = splitRepository(request.source_repository);
  return {
    source_repository: request.source_repository,
    source_owner: owner,
    source_repository_name: name,
  };
}

function buildNpmEnvOutputs(request) {
  return {
    ...buildSourceRepositoryOutputs(request),
    npm_package_name: request.npm_package_name,
    npm_package_dir: request.npm_package_dir,
    npm_dist_tag: request.npm_dist_tag,
    npm_version_strategy: request.npm_version_strategy,
  };
}

const outputBuilders = {
  async prepare(env) {
    const request = await resolvePrepareRequest(env);
    return {
      service_request: JSON.stringify(request, null, 2),
      has_image: request.has_image,
      has_npm: request.has_npm,
      image_matrix: JSON.stringify(buildImageMatrix(request)),
      npm_matrix: JSON.stringify({ include: request.npm_platforms ?? [] }),
    };
  },

  'image-env': async (env) => {
    const request = parseServiceRequest(env);
    return {
      service_name: request.service_name,
      ...buildSourceRepositoryOutputs(request),
      build_context: request.build_context,
      dockerfile_path: request.dockerfile_path,
      ghcr_image_repository: request.ghcr_image_repository,
      image_tag: request.image_tag,
      build_args_json: JSON.stringify(request.build_args ?? {}),
    };
  },

  'image-manifest-env': async (env) => {
    const request = parseServiceRequest(env);
    return {
      service_name: request.service_name,
      ghcr_image_repository: request.ghcr_image_repository,
      image_tag: request.image_tag,
    };
  },

  'npm-env': async (env) => buildNpmEnvOutputs(parseServiceRequest(env)),

  'npm-github-release-env': async (env) => {
    const request = parseServiceRequest(env);
    return {
      ...buildSourceRepositoryOutputs(request),
      npm_package_name: request.npm_package_name,
    };
  },
};

export async function buildWorkflowOutputs(mode, env = process.env) {
  const builder = outputBuilders[mode];
  if (!builder) {
    throw new Error(`不支持的输出模式：${mode}`);
  }
  return builder(env);
}

async function main() {
  const [mode] = process.argv.slice(2);
  if (!mode) {
    throw new Error('用法：node scripts/write-release-workflow-output.mjs <mode>');
  }

  const outputPath = requireEnv(process.env, 'GITHUB_OUTPUT');
  await appendGithubOutputs(await buildWorkflowOutputs(mode), outputPath);
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
