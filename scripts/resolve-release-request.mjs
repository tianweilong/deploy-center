#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';

export const RELEASE_TAG_PATTERN = /^v\d{4}\.([1-9]|1[0-2])\.([1-9]|[12]\d|3[01])-t\d{4}$/;

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function stripComment(line) {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === "'" || char === '"') && (!quote || quote === char)) {
      quote = quote ? '' : char;
      continue;
    }
    if (char === '#' && !quote && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function nextMeaningfulLine(lines, startIndex) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const raw = stripComment(lines[index]);
    if (raw.trim()) {
      return raw.trim();
    }
  }
  return '';
}

function parseMapEntry(text) {
  const separator = text.indexOf(':');
  if (separator === -1) {
    throw new Error(`不支持的 YAML 行：${text}`);
  }
  const key = text.slice(0, separator).trim();
  const value = text.slice(separator + 1).trim();
  if (!key) {
    throw new Error(`不支持的 YAML 键：${text}`);
  }
  return { key, value };
}

function attachChild(parent, key, child) {
  if (Array.isArray(parent)) {
    const item = {};
    item[key] = child;
    parent.push(item);
    return item;
  }
  parent[key] = child;
  return child;
}

export function parseSimpleYaml(content) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = stripComment(lines[lineIndex]);
    if (!rawLine.trim()) {
      continue;
    }

    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }

    const parent = stack.at(-1).value;
    if (line.startsWith('- ')) {
      if (!Array.isArray(parent)) {
        throw new Error(`不支持的 YAML 列表位置：${rawLine}`);
      }

      const itemText = line.slice(2).trim();
      if (!itemText.includes(':')) {
        parent.push(parseScalar(itemText));
        continue;
      }

      const { key, value } = parseMapEntry(itemText);
      const item = {};
      item[key] = value ? parseScalar(value) : {};
      parent.push(item);
      stack.push({ indent, value: item });
      if (!value) {
        stack.push({ indent: indent + 2, value: item[key] });
      }
      continue;
    }

    const { key, value } = parseMapEntry(line);
    if (value) {
      parent[key] = parseScalar(value);
      continue;
    }

    const nextLine = nextMeaningfulLine(lines, lineIndex);
    const child = nextLine.startsWith('- ') ? [] : {};
    const attached = attachChild(parent, key, child);
    stack.push({ indent, value: attached });
  }

  return root;
}

function requireText(object, field) {
  const value = object[field];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`缺少必填字段：${field}`);
  }
  return String(value).trim();
}

function requireServiceText(service, serviceName, field) {
  const value = service[field];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`服务 ${serviceName} 缺少配置字段：${field}`);
  }
  return String(value).trim();
}

function normalizeArray(value, field) {
  if (Array.isArray(value)) {
    return value;
  }
  throw new Error(`配置字段 ${field} 必须是数组`);
}

function resolveBuildArgValue(value, variables, serviceName, argName) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const envName = value.env;
    if (!envName) {
      throw new Error(`服务 ${serviceName} 的构建参数 ${argName} 缺少 env 字段`);
    }
    const resolved = variables[envName] ?? process.env[envName] ?? '';
    if (String(resolved).trim() === '') {
      throw new Error(`服务 ${serviceName} 的构建参数 ${argName} 缺少环境变量：${envName}`);
    }
    return String(resolved);
  }
  return String(value);
}

function resolveBuildArgs(buildArgs, variables, serviceName) {
  const entries = Object.entries(buildArgs ?? {});
  return Object.fromEntries(
    entries.map(([argName, value]) => [
      argName,
      resolveBuildArgValue(value, variables, serviceName, argName),
    ]),
  );
}

export function resolveCalendarNpmVersion(sourceTag) {
  if (!RELEASE_TAG_PATTERN.test(sourceTag)) {
    throw new Error('source_tag must match vYYYY.M.D-tHHmm');
  }
  return sourceTag.slice(1);
}

export function resolveReleaseRequest(config, payload) {
  const serviceName = requireText(payload, 'service_name');
  const services = config.services ?? {};
  const service = services[serviceName];
  if (!service) {
    throw new Error(`未知服务：${serviceName}`);
  }

  const sourceRef = requireText(payload, 'source_ref');
  const sourceSha = requireText(payload, 'source_sha');
  const sourceTag = requireText(payload, 'source_tag');
  const buildDate = process.env.BUILD_DATE || new Date().toISOString();
  if (!RELEASE_TAG_PATTERN.test(sourceTag)) {
    throw new Error('source_tag must match vYYYY.M.D-tHHmm');
  }

  const resolved = {
    service_name: serviceName,
    source_repository: requireServiceText(service, serviceName, 'sourceRepository'),
    source_ref: sourceRef,
    source_sha: sourceSha,
    source_tag: sourceTag,
    image_tag: sourceTag,
    has_image: Boolean(service.ghcrImageRepository),
    has_npm: Boolean(service.npmPackageName),
  };

  if (resolved.has_image) {
    resolved.build_context = requireServiceText(service, serviceName, 'buildContext');
    resolved.dockerfile_path = requireServiceText(service, serviceName, 'dockerfilePath');
    resolved.ghcr_image_repository = requireServiceText(service, serviceName, 'ghcrImageRepository');
    resolved.platforms = normalizeArray(service.defaultPlatforms, 'defaultPlatforms');
    resolved.build_args = resolveBuildArgs(
      service.buildArgs,
      { SOURCE_TAG: sourceTag, SOURCE_SHA: sourceSha, BUILD_DATE: buildDate },
      serviceName,
    );
  }

  if (resolved.has_npm) {
    resolved.npm_package_name = requireServiceText(service, serviceName, 'npmPackageName');
    resolved.npm_package_dir = requireServiceText(service, serviceName, 'npmPackageDir');
    resolved.npm_version_strategy = service.npmVersionStrategy ?? 'calendar_tag';
    resolved.npm_dist_tag = service.npmDistTag ?? 'latest';
    resolved.npm_publish_version = resolveCalendarNpmVersion(sourceTag);
    resolved.npm_platforms = normalizeArray(service.npmPlatforms, 'npmPlatforms');
  }

  return resolved;
}

async function main() {
  const [configPath, payloadPath] = process.argv.slice(2);
  if (!configPath || !payloadPath) {
    throw new Error('用法：node scripts/resolve-release-request.mjs <services.yaml> <payload.json>');
  }

  const config = parseSimpleYaml(await readFile(configPath, 'utf8'));
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(resolveReleaseRequest(config, payload), null, 2)}\n`);
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
