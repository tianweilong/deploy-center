# deploy-center 发布逻辑对齐实现计划

> **执行方式：** 使用 `superpowers:executing-plans` 按任务逐步执行本计划。步骤使用复选框语法（`- [ ]`）作为执行账本；执行完成后由 `executing-plans` 将对应步骤回写为 `- [x]`。

**目标：** 将 `deploy-center` 的发布触发、GHCR 镜像构建、latest 镜像标签和 npm calendar 版本发布逻辑对齐到已批准规格。

**架构：** 引入中心化 `config/services.yaml` 和请求解析脚本，用 `service_name + source_tag` 生成镜像与 npm 发布上下文。Workflow 只执行 GHCR 构建和现有 npm 发布链路，不引入 ACR mirror、candidate release 或 test deploy。npm 使用 `calendar_tag` 将 `vYYYY.M.D-HHmm` 映射为 `YYYY.M.D-HHmm`，并显式以 `latest` dist-tag 发布。

**技术栈：** GitHub Actions YAML、Node.js ESM 脚本、Ruby YAML 校验、npm Trusted Publishing、Docker Buildx、Node 内置测试与断言。

---

## 文件结构

- Create: `deploy-center--tianweilong/config/services.yaml`
  - 统一服务配置，替代 `config/services.<repo>.json` 主路径。
- Create: `deploy-center--tianweilong/scripts/resolve-release-request.mjs`
  - 解析 dispatch payload 和 `config/services.yaml`，输出 workflow 使用的 JSON 上下文。
- Modify: `deploy-center--tianweilong/scripts/npm-release-common.mjs`
  - 增加 Lindos tag 校验、`calendar_tag` npm 版本策略、默认 `latest` dist-tag。
- Modify: `deploy-center--tianweilong/.github/workflows/release-service.yml`
  - 改为 `service_name` 触发模型，新增 `build-and-push-ghcr`，保留 npm 发布 jobs。
- Modify: `deploy-center--tianweilong/.github/workflows/validate-deployment-config.yml`
  - 增加新脚本语法检查。
- Modify: `deploy-center--tianweilong/tests/test-npm-release-common.mjs`
  - 覆盖 `calendar_tag` 与 tag 校验。
- Create: `deploy-center--tianweilong/tests/resolve-release-request.mjs`
  - 覆盖请求解析、非法 tag、缺失配置。
- Modify: `deploy-center--tianweilong/tests/release-workflow.mjs`
  - 更新 workflow contract，确认新入口、GHCR 双 tag、无 ACR/candidate/deploy-test。
- Modify: `deploy-center--tianweilong/tests/npm-release-workflow.mjs`
  - 更新 npm workflow contract，确认 npm 配置来自 resolver 且 dist-tag 为 `latest`。
- Modify: `deploy-center--tianweilong/tests/publish-npm-package-dist-tag.mjs`
  - 将空 dist-tag 测试改为显式 `latest` 语义。
- Modify: `deploy-center--tianweilong/tests/prepare-release-matrix.mjs`
  - 删除或改写允许旧 tag 的测试路径；若脚本废弃，仅保留不影响主路径的兼容测试。
- Modify: `deploy-center--tianweilong/README.md`
  - 文档同步新触发契约、tag 格式、镜像 latest、npm latest dist-tag。

## Task 1: 新增服务配置

**Files:**
- Create: `deploy-center--tianweilong/config/services.yaml`
- Test: `deploy-center--tianweilong/tests/resolve-release-request.mjs`

说明：每个步骤前的复选框就是该步骤的状态。执行时由 `executing-plans` 将完成的步骤从 `- [ ]` 更新为 `- [x]`。

- [x] **Step 1: 创建失败测试，断言服务配置存在并含有当前服务**

在 `tests/resolve-release-request.mjs` 写入最小测试骨架，先只校验 `config/services.yaml` 存在并包含 `vibe-kanban-remote`、`vibe-kanban-relay`、`vibe-kanban-npm`：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { repoRoot } from './helpers.mjs';

test('config/services.yaml 定义 deploy-center 当前发布服务', async () => {
  const content = await readFile(path.join(repoRoot, 'config/services.yaml'), 'utf8');

  assert.match(content, /^services:\n/m);
  assert.match(content, /^  vibe-kanban-remote:/m);
  assert.match(content, /^  vibe-kanban-relay:/m);
  assert.match(content, /^  vibe-kanban-npm:/m);
});
```

- [x] **Step 2: 运行测试，确认配置缺失失败**

Run: `cd deploy-center--tianweilong && node --test tests/resolve-release-request.mjs`

Expected: FAIL，错误包含 `ENOENT` 或 `config/services.yaml`。

- [x] **Step 3: 创建 `config/services.yaml`**

Create `config/services.yaml` with:

```yaml
services:
  vibe-kanban-remote:
    sourceRepository: tianweilong/vibe-kanban
    buildContext: .
    dockerfilePath: crates/remote/Dockerfile
    ghcrImageRepository: ghcr.io/tianweilong/vibe-kanban-remote
    defaultPlatforms:
      - linux/amd64
      - linux/arm64

  vibe-kanban-relay:
    sourceRepository: tianweilong/vibe-kanban
    buildContext: .
    dockerfilePath: crates/relay-tunnel/Dockerfile
    ghcrImageRepository: ghcr.io/tianweilong/vibe-kanban-relay
    defaultPlatforms:
      - linux/amd64
      - linux/arm64

  vibe-kanban-npm:
    sourceRepository: tianweilong/vibe-kanban
    npmPackageName: '@vino.tian/vibe-kanban'
    npmPackageDir: npx-cli
    npmVersionStrategy: calendar_tag
    npmDistTag: latest
    npmPlatforms:
      - runner: ubuntu-latest
        target: linux-x64
        targetOs: linux
        targetArch: x64
        archiveExt: tar.gz
      - runner: ubuntu-latest
        target: linux-arm64
        targetOs: linux
        targetArch: arm64
        archiveExt: tar.gz
      - runner: windows-latest
        target: win32-x64
        targetOs: win32
        targetArch: x64
        archiveExt: zip
      - runner: macos-15
        target: darwin-arm64
        targetOs: darwin
        targetArch: arm64
        archiveExt: tar.gz
```

- [x] **Step 4: 运行测试，确认配置存在**

Run: `cd deploy-center--tianweilong && node --test tests/resolve-release-request.mjs`

Expected: PASS。

## Task 2: 实现请求解析脚本

**Files:**
- Create: `deploy-center--tianweilong/scripts/resolve-release-request.mjs`
- Modify: `deploy-center--tianweilong/tests/resolve-release-request.mjs`

- [x] **Step 1: 扩展失败测试，解析镜像服务**

Append to `tests/resolve-release-request.mjs`:

```js
import { mkdir, writeFile } from 'node:fs/promises';
import { createTempDir, removeDir, runNode } from './helpers.mjs';

async function runResolver(payload) {
  const tempRoot = await createTempDir('deploy-center-resolve-release-');
  const payloadPath = path.join(tempRoot, 'payload.json');
  await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  try {
    const stdout = runNode([
      'scripts/resolve-release-request.mjs',
      'config/services.yaml',
      payloadPath,
    ]);
    return JSON.parse(stdout);
  } finally {
    await removeDir(tempRoot);
  }
}

test('resolve-release-request 解析镜像服务上下文', async () => {
  const resolved = await runResolver({
    service_name: 'vibe-kanban-remote',
    source_ref: 'refs/tags/v2026.4.19-1116',
    source_sha: '0123456789abcdef0123456789abcdef01234567',
    source_tag: 'v2026.4.19-1116',
  });

  assert.equal(resolved.service_name, 'vibe-kanban-remote');
  assert.equal(resolved.source_repository, 'tianweilong/vibe-kanban');
  assert.equal(resolved.image_tag, 'v2026.4.19-1116');
  assert.equal(resolved.ghcr_image_repository, 'ghcr.io/tianweilong/vibe-kanban-remote');
  assert.deepEqual(resolved.platforms, ['linux/amd64', 'linux/arm64']);
  assert.equal(resolved.has_image, true);
  assert.equal(resolved.has_npm, false);
});
```

Remove unused imports if Node reports duplicate imports.

- [x] **Step 2: 运行测试，确认脚本缺失失败**

Run: `cd deploy-center--tianweilong && node --test tests/resolve-release-request.mjs`

Expected: FAIL，错误包含 `scripts/resolve-release-request.mjs`。

- [x] **Step 3: 实现最小 resolver 脚本**

Create `scripts/resolve-release-request.mjs` with:

```js
#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { isMainModule } from './module-entrypoint.mjs';

export const RELEASE_TAG_PATTERN = /^v\d{4}\.\d{1,2}\.\d{1,2}-\d{4}$/;

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSimpleYaml(content) {
  const root = {};
  const stack = [{ indent: -1, value: root }];

  for (const rawLine of content.split('\n')) {
    const withoutComment = rawLine.replace(/\s+#.*$/, '');
    if (!withoutComment.trim()) continue;

    const indent = withoutComment.match(/^ */)[0].length;
    const line = withoutComment.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).value;

    if (line.startsWith('- ')) {
      if (!Array.isArray(parent)) throw new Error(`不支持的 YAML 列表位置：${rawLine}`);
      const itemText = line.slice(2).trim();
      if (itemText.includes(':')) {
        const [key, ...rest] = itemText.split(':');
        const item = {};
        const value = rest.join(':').trim();
        item[key.trim()] = value ? parseScalar(value) : {};
        parent.push(item);
        stack.push({ indent, value: item });
      } else {
        parent.push(parseScalar(itemText));
      }
      continue;
    }

    const [key, ...rest] = line.split(':');
    const name = key.trim();
    const value = rest.join(':').trim();
    if (!name) throw new Error(`不支持的 YAML 行：${rawLine}`);

    if (value) {
      parent[name] = parseScalar(value);
      continue;
    }

    const nextContainer = {};
    parent[name] = nextContainer;
    stack.push({ indent, value: nextContainer });
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
  if (Array.isArray(value)) return value;
  throw new Error(`配置字段 ${field} 必须是数组`);
}

export function resolveCalendarNpmVersion(sourceTag) {
  if (!RELEASE_TAG_PATTERN.test(sourceTag)) {
    throw new Error('source_tag must match vYYYY.M.D-HHmm');
  }
  return sourceTag.slice(1);
}

export function resolveReleaseRequest(config, payload) {
  const serviceName = requireText(payload, 'service_name');
  const services = config.services ?? {};
  const service = services[serviceName];
  if (!service) throw new Error(`未知服务：${serviceName}`);

  const sourceRef = requireText(payload, 'source_ref');
  const sourceSha = requireText(payload, 'source_sha');
  const sourceTag = requireText(payload, 'source_tag');
  if (!RELEASE_TAG_PATTERN.test(sourceTag)) {
    throw new Error('source_tag must match vYYYY.M.D-HHmm');
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
    resolved.build_args = service.buildArgs ?? {};
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
```

- [x] **Step 4: 运行 resolver 测试，确认镜像解析通过**

Run: `cd deploy-center--tianweilong && node --test tests/resolve-release-request.mjs`

Expected: PASS。

## Task 3: 补齐 resolver 校验和 npm 上下文

**Files:**
- Modify: `deploy-center--tianweilong/tests/resolve-release-request.mjs`
- Modify: `deploy-center--tianweilong/scripts/resolve-release-request.mjs`

- [x] **Step 1: 添加 npm 服务解析测试**

Append to `tests/resolve-release-request.mjs`:

```js
test('resolve-release-request 解析 npm calendar 发布上下文', async () => {
  const resolved = await runResolver({
    service_name: 'vibe-kanban-npm',
    source_ref: 'refs/tags/v2026.4.19-1116',
    source_sha: '0123456789abcdef0123456789abcdef01234567',
    source_tag: 'v2026.4.19-1116',
  });

  assert.equal(resolved.has_image, false);
  assert.equal(resolved.has_npm, true);
  assert.equal(resolved.npm_package_name, '@vino.tian/vibe-kanban');
  assert.equal(resolved.npm_package_dir, 'npx-cli');
  assert.equal(resolved.npm_version_strategy, 'calendar_tag');
  assert.equal(resolved.npm_dist_tag, 'latest');
  assert.equal(resolved.npm_publish_version, '2026.4.19-1116');
  assert.equal(resolved.npm_platforms.length, 4);
});
```

- [x] **Step 2: 添加非法 tag 测试**

Append to `tests/resolve-release-request.mjs`:

```js
async function runResolverFailure(payload) {
  const tempRoot = await createTempDir('deploy-center-resolve-release-fail-');
  const payloadPath = path.join(tempRoot, 'payload.json');
  await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  try {
    assert.throws(
      () => runNode(['scripts/resolve-release-request.mjs', 'config/services.yaml', payloadPath]),
      /source_tag must match vYYYY\.M\.D-HHmm/,
    );
  } finally {
    await removeDir(tempRoot);
  }
}

test('resolve-release-request 拒绝旧 tag 格式', async () => {
  const basePayload = {
    service_name: 'vibe-kanban-remote',
    source_ref: 'refs/tags/v2026.4.19-1116',
    source_sha: '0123456789abcdef0123456789abcdef01234567',
  };

  await runResolverFailure({ ...basePayload, source_tag: 'latest' });
  await runResolverFailure({ ...basePayload, source_tag: 'v1.2.3' });
  await runResolverFailure({ ...basePayload, source_tag: '2026.04.19.1' });
});
```

- [x] **Step 3: 运行测试，确认新增用例通过**

Run: `cd deploy-center--tianweilong && node --test tests/resolve-release-request.mjs`

Expected: PASS。

- [x] **Step 4: 添加脚本语法校验**

Modify `.github/workflows/validate-deployment-config.yml`，在 `校验发布辅助脚本` step 中加入：

```yaml
          node --check scripts/resolve-release-request.mjs
```

Expected context:

```yaml
      - name: 校验发布辅助脚本
        run: |
          node --check scripts/resolve-release-request.mjs
          node --check scripts/prepare-release-matrix.mjs
```

- [x] **Step 5: 运行脚本语法校验**

Run: `cd deploy-center--tianweilong && node --check scripts/resolve-release-request.mjs`

Expected: PASS，无输出。

## Task 4: npm calendar 版本策略

**Files:**
- Modify: `deploy-center--tianweilong/scripts/npm-release-common.mjs`
- Modify: `deploy-center--tianweilong/tests/test-npm-release-common.mjs`

- [x] **Step 1: 写失败测试，覆盖 `calendar_tag`**

Modify `tests/test-npm-release-common.mjs`，在 `resolvePublishVersion 支持 source_tag 策略` 后添加：

```js
test('resolvePublishVersion 支持 calendar_tag 策略', () => {
  assert.equal(
    resolvePublishVersion({
      strategy: 'calendar_tag',
      sourceTag: 'v2026.4.19-1116',
      packageVersion: '0.0.0',
    }),
    '2026.4.19-1116',
  );
});

test('resolvePublishVersion 拒绝 calendar_tag 旧格式', () => {
  assert.throws(
    () => resolvePublishVersion({ strategy: 'calendar_tag', sourceTag: 'v1.2.3', packageVersion: '0.0.0' }),
    /vYYYY\.M\.D-HHmm/,
  );
});
```

- [x] **Step 2: 运行测试，确认 `calendar_tag` 未实现失败**

Run: `cd deploy-center--tianweilong && node --test tests/test-npm-release-common.mjs`

Expected: FAIL，错误包含 `不支持的 npm_version_strategy：calendar_tag`。

- [x] **Step 3: 实现 `calendar_tag` 解析**

Modify `scripts/npm-release-common.mjs`，在 `parseSourceTagVersion` 后添加：

```js
export function parseCalendarTagVersion(sourceTag) {
  const match = /^v(\d{4}\.\d{1,2}\.\d{1,2}-\d{4})$/.exec(sourceTag);
  if (!match) {
    throw new Error(`发布标签 ${sourceTag} 不符合 vYYYY.M.D-HHmm 格式。`);
  }

  return match[1];
}
```

Modify `resolvePublishVersion` switch，加入：

```js
    case 'calendar_tag':
      return parseCalendarTagVersion(sourceTag);
```

- [x] **Step 4: 运行 npm common 测试**

Run: `cd deploy-center--tianweilong && node --test tests/test-npm-release-common.mjs`

Expected: PASS。

## Task 5: npm 默认 latest dist-tag

**Files:**
- Modify: `deploy-center--tianweilong/scripts/npm-release-common.mjs`
- Modify: `deploy-center--tianweilong/tests/prepare-npm-publish-input-version-sync.mjs`
- Modify: `deploy-center--tianweilong/tests/publish-npm-package-dist-tag.mjs`

- [x] **Step 1: 写失败测试，确认 `calendar_tag` 默认 `latest`**

Modify `tests/prepare-npm-publish-input-version-sync.mjs` 中环境变量用例，新增一个 calendar case。若文件目前只有单场景测试，在末尾追加：

```js
const calendarTempRoot = await createTempDir('deploy-center-calendar-version-');
try {
  await copyDir('tests/fixtures/release-npm-package-source', calendarTempRoot);
  const sourceDir = path.join(calendarTempRoot, 'release-npm-package-source');
  await runNode(['scripts/prepare-npm-publish-input.mjs', sourceDir], {
    env: {
      SOURCE_TAG: 'v2026.4.19-1116',
      NPM_PACKAGE_NAME: '@vino.tian/myte',
      NPM_PACKAGE_DIR: 'npm/myte',
      NPM_VERSION_STRATEGY: 'calendar_tag',
      OUTPUT_DIR: '../calendar-npm-publish-input',
    },
  });
  const context = JSON.parse(
    await readFile(path.join(calendarTempRoot, 'calendar-npm-publish-input', 'publish-context.json'), 'utf8'),
  );
  assert.equal(context.publishVersion, '2026.4.19-1116');
  assert.equal(context.publishTag, 'latest');
} finally {
  await removeDir(calendarTempRoot);
}
```

Keep imports consistent with the existing file.

- [x] **Step 2: 运行测试，确认默认 dist-tag 仍为空导致失败**

Run: `cd deploy-center--tianweilong && node --test tests/prepare-npm-publish-input-version-sync.mjs`

Expected: FAIL，断言 `context.publishTag` 实际为 `''`。

- [x] **Step 3: 修改默认 dist-tag 规则**

Modify `scripts/npm-release-common.mjs` in `initNpmReleaseContext`:

```js
  const publishTag = env.NPM_DIST_TAG?.trim() ?? '';
```

Replace with:

```js
  const publishTagInput = env.NPM_DIST_TAG?.trim();
  const publishTag = publishTagInput || 'latest';
```

- [x] **Step 4: 更新 publish dist-tag 测试的空值语义**

Modify `tests/publish-npm-package-dist-tag.mjs` test name and expectation at the current empty-tag case:

```js
test('publish-npm-package 在 publishTag 为 latest 时显式附加 --tag latest', async () => {
  const tempRoot = await createTempDir('deploy-center-publish-latest-');
  try {
    const commands = await runPublish(tempRoot, 'latest');
    const publishCommand = commands.find((entry) => entry.command === 'publish');

    assert.ok(publishCommand, '期望执行 npm publish');
    assert.deepEqual(publishCommand.args, [
      'vino.tian-myte-0.1.4.tgz',
      '--access',
      'public',
      '--tag',
      'latest',
    ]);
  } finally {
    await removeDir(tempRoot);
  }
});
```

Do not keep the old assertion that empty tag omits `--tag`.

- [x] **Step 5: 运行 npm 相关测试**

Run:

```bash
cd deploy-center--tianweilong
node --test tests/prepare-npm-publish-input-version-sync.mjs
node --test tests/publish-npm-package-dist-tag.mjs
```

Expected: both PASS。

## Task 6: 重写发布 workflow 主路径

**Files:**
- Modify: `deploy-center--tianweilong/.github/workflows/release-service.yml`
- Modify: `deploy-center--tianweilong/tests/release-workflow.mjs`

- [x] **Step 1: 写失败 contract，确认新触发字段和无旧入口**

Modify `tests/release-workflow.mjs` patterns:

Add required patterns:

```js
  'service_name',
  'SERVICE_NAME: ${{ github.event.client_payload.service_name || inputs.service_name }}',
  'node scripts/resolve-release-request.mjs config/services.yaml /tmp/release-input.json',
  'build-and-push-ghcr:',
  'GHCR_IMAGE_REPOSITORY',
  'docker buildx build',
  '${GHCR_IMAGE_REPOSITORY}:${IMAGE_TAG}',
  '${GHCR_IMAGE_REPOSITORY}:latest',
```

Add forbidden patterns:

```js
  'release_targets',
  'config/services.${source_repository_name}.json',
  'merge-image-manifest:',
  'docker/build-push-action@v6',
  'mirror-to-acr:',
  'update-candidate:',
  'deploy-test:',
```

Replace the existing exact checkout count assertion with:

```js
assert.equal(
  [...file.matchAll(/^      - uses: actions\/checkout@v6$/gm)].length,
  6,
  'actions/checkout@v6 次数不符合预期',
);
```

- [x] **Step 2: 运行 workflow contract，确认旧 workflow 失败**

Run: `cd deploy-center--tianweilong && node --test tests/release-workflow.mjs`

Expected: FAIL，至少因为旧 workflow 仍包含 `release_targets` 且缺少 `build-and-push-ghcr`。

- [x] **Step 3: 重写 workflow prepare job**

Modify `.github/workflows/release-service.yml` top inputs/env to:

```yaml
on:
  repository_dispatch:
    types:
      - deploy-center-release
  workflow_dispatch:
    inputs:
      service_name:
        description: 服务名
        required: true
        type: string
      source_ref:
        description: 源引用
        required: true
        type: string
      source_sha:
        description: 源提交 SHA
        required: true
        type: string
      source_tag:
        description: 源标签，格式 vYYYY.M.D-HHmm
        required: true
        type: string

permissions:
  contents: read
  packages: write
  id-token: write

env:
  SERVICE_NAME: ${{ github.event.client_payload.service_name || inputs.service_name }}
  SOURCE_REF: ${{ github.event.client_payload.source_ref || inputs.source_ref }}
  SOURCE_SHA: ${{ github.event.client_payload.source_sha || inputs.source_sha }}
  SOURCE_TAG: ${{ github.event.client_payload.source_tag || inputs.source_tag }}
```

Replace `prepare` job body with a resolver-driven job that writes `/tmp/release-input.json`, runs `node scripts/resolve-release-request.mjs config/services.yaml /tmp/release-input.json`, and outputs:

```yaml
outputs:
  service_request: ${{ steps.resolve.outputs.service_request }}
  has_image: ${{ steps.resolve.outputs.has_image }}
  has_npm: ${{ steps.resolve.outputs.has_npm }}
  npm_matrix: ${{ steps.resolve.outputs.npm_matrix }}
```

Use this complete resolve step:

```yaml
      - id: resolve
        name: 解析发布请求
        run: |
          set -euo pipefail
          cat > /tmp/release-input.json <<JSON
          {
            "service_name": "${SERVICE_NAME}",
            "source_ref": "${SOURCE_REF}",
            "source_sha": "${SOURCE_SHA}",
            "source_tag": "${SOURCE_TAG}"
          }
          JSON
          node scripts/resolve-release-request.mjs config/services.yaml /tmp/release-input.json > /tmp/service-request.json
          {
            echo 'service_request<<EOF'
            cat /tmp/service-request.json
            echo 'EOF'
          } >> "${GITHUB_OUTPUT}"
          node <<'NODE' >> "${GITHUB_OUTPUT}"
          const fs = require('node:fs');
          const request = JSON.parse(fs.readFileSync('/tmp/service-request.json', 'utf8'));
          console.log(`has_image=${request.has_image}`);
          console.log(`has_npm=${request.has_npm}`);
          console.log(`npm_matrix=${JSON.stringify({ include: request.npm_platforms ?? [] })}`);
          NODE
```

Do not use this broken pattern, because same-step output values are not available as `${{ steps.*.outputs.* }}` until the step finishes:

```bash
set -euo pipefail
cat > /tmp/release-input.json <<JSON
{
  "service_name": "${SERVICE_NAME}",
  "source_ref": "${SOURCE_REF}",
  "source_sha": "${SOURCE_SHA}",
  "source_tag": "${SOURCE_TAG}"
}
JSON
service_request=$(node scripts/resolve-release-request.mjs config/services.yaml /tmp/release-input.json)
{
  echo 'service_request<<EOF'
  echo "${service_request}"
  echo 'EOF'
} >> "${GITHUB_OUTPUT}"
node <<'NODE' >> "${GITHUB_OUTPUT}"
const request = JSON.parse(process.env.SERVICE_REQUEST);
console.log(`has_image=${request.has_image}`);
console.log(`has_npm=${request.has_npm}`);
console.log(`npm_matrix=${JSON.stringify({ include: request.npm_platforms ?? [] })}`);
NODE
```

- [x] **Step 4: 添加 `build-and-push-ghcr` job**

Replace old `build` and `merge-image-manifest` jobs with this job skeleton:

```yaml
  build-and-push-ghcr:
    needs: prepare
    if: ${{ needs.prepare.outputs.has_image == 'true' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v6

      - name: 解析镜像构建环境
        env:
          SERVICE_REQUEST: ${{ needs.prepare.outputs.service_request }}
        run: |
          printf '%s\n' "${SERVICE_REQUEST}" > /tmp/service-request.json
          node <<'NODE' >> "${GITHUB_ENV}"
          const fs = require('node:fs');
          const request = JSON.parse(fs.readFileSync('/tmp/service-request.json', 'utf8'));
          const env = {
            SOURCE_REPOSITORY: request.source_repository,
            BUILD_CONTEXT: request.build_context,
            DOCKERFILE_PATH: request.dockerfile_path,
            GHCR_IMAGE_REPOSITORY: request.ghcr_image_repository,
            IMAGE_TAG: request.image_tag,
            PLATFORMS: request.platforms.join(','),
          };
          for (const [key, value] of Object.entries(env)) {
            console.log(`${key}=${value}`);
          }
          NODE

      - uses: ./.github/actions/checkout-source
        with:
          repository: ${{ env.SOURCE_REPOSITORY }}
          ref: ${{ env.SOURCE_SHA }}
          path: source
          token: ${{ secrets.SOURCE_REPO_TOKEN }}
          fetch-depth: 1

      - name: 登录 GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: 配置 QEMU
        if: ${{ contains(env.PLATFORMS, 'linux/arm64') }}
        uses: docker/setup-qemu-action@v3

      - name: 配置 Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: 构建并推送 GHCR 镜像
        working-directory: source
        run: |
          set -euo pipefail
          docker_tags=(
            -t "${GHCR_IMAGE_REPOSITORY}:${IMAGE_TAG}"
            -t "${GHCR_IMAGE_REPOSITORY}:latest"
          )
          docker buildx build \
            --label "org.opencontainers.image.source=https://github.com/${SOURCE_REPOSITORY}" \
            --platform "${PLATFORMS}" \
            -f "${DOCKERFILE_PATH}" \
            "${docker_tags[@]}" \
            --push \
            "${BUILD_CONTEXT}"
```

The final build command must retain both tags:

```bash
IFS=',' read -r -a platforms <<< "${PLATFORMS}"
docker_tags=(
  -t "${GHCR_IMAGE_REPOSITORY}:${IMAGE_TAG}"
  -t "${GHCR_IMAGE_REPOSITORY}:latest"
)
docker buildx build \
  --label "org.opencontainers.image.source=https://github.com/${SOURCE_REPOSITORY}" \
  --platform "${PLATFORMS}" \
  -f "${DOCKERFILE_PATH}" \
  "${docker_tags[@]}" \
  --push \
  "${BUILD_CONTEXT}"
```

Also add `SOURCE_SHA: ${{ github.event.client_payload.source_sha || inputs.source_sha }}` to top-level `env` if it was removed during rewrite; the checkout-source step depends on it.

- [x] **Step 5: Run workflow contract**

Run: `cd deploy-center--tianweilong && node --test tests/release-workflow.mjs`

Expected: PASS。

## Task 7: Wire resolver output into npm jobs

**Files:**
- Modify: `deploy-center--tianweilong/.github/workflows/release-service.yml`
- Modify: `deploy-center--tianweilong/tests/npm-release-workflow.mjs`

- [x] **Step 1: Update npm workflow contract for resolver-derived env**

Modify `tests/npm-release-workflow.mjs` required patterns to include:

```js
  'needs.prepare.outputs.has_npm == \'true\'',
  'NPM_PACKAGE_NAME: ${{ env.NPM_PACKAGE_NAME }}',
  'NPM_PACKAGE_DIR: ${{ env.NPM_PACKAGE_DIR }}',
  'NPM_VERSION_STRATEGY: ${{ env.NPM_VERSION_STRATEGY }}',
  'NPM_DIST_TAG: ${{ env.NPM_DIST_TAG }}',
  'calendar_tag',
  'latest',
```

Add forbidden patterns:

```js
  'github.event.client_payload.npm_package_name',
  'inputs.npm_package_name',
  'NPM_BASE_VERSION_FILE',
  'NPM_VERSION_PATCH_FACTOR',
```

Keep existing required patterns for platform asset jobs, GitHub Release, Trusted Publishing, Go/Rust/Tauri setup. Replace any exact checkout count assertion with the same count used in `tests/release-workflow.mjs`: `6`.

- [x] **Step 2: 运行 npm workflow contract，确认旧 env 失败**

Run: `cd deploy-center--tianweilong && node --test tests/npm-release-workflow.mjs`

Expected: FAIL，因为 workflow 仍从 dispatch env 读取 npm 输入。

- [x] **Step 3: Add a reusable request-to-env step before npm commands**

In each npm job (`prepare-npm-publish-input`, `release-npm-assets`, `release-github-release`, `release-npm`), add a step before source checkout or before npm script execution:

```yaml
      - name: 解析 npm 发布环境
        env:
          SERVICE_REQUEST: ${{ needs.prepare.outputs.service_request }}
        run: |
          printf '%s\n' "${SERVICE_REQUEST}" > /tmp/service-request.json
          node <<'NODE' >> "${GITHUB_ENV}"
          const fs = require('node:fs');
          const request = JSON.parse(fs.readFileSync('/tmp/service-request.json', 'utf8'));
          const env = {
            SOURCE_REPOSITORY: request.source_repository,
            NPM_PACKAGE_NAME: request.npm_package_name,
            NPM_PACKAGE_DIR: request.npm_package_dir,
            NPM_DIST_TAG: request.npm_dist_tag,
            NPM_VERSION_STRATEGY: request.npm_version_strategy,
          };
          for (const [key, value] of Object.entries(env)) {
            console.log(`${key}=${value}`);
          }
          NODE
```

Then make checkout-source use `${{ env.SOURCE_REPOSITORY }}` and npm script env use `${{ env.NPM_* }}`. Remove `NPM_BASE_VERSION_FILE` and `NPM_VERSION_PATCH_FACTOR` from workflow env for the new path.

- [x] **Step 4: Ensure npm matrix comes from resolver**

In `release-npm-assets`, keep:

```yaml
strategy:
  fail-fast: false
  matrix: ${{ fromJSON(needs.prepare.outputs.npm_matrix) }}
```

Ensure `prepare` outputs `npm_matrix` from `request.npm_platforms`.

- [x] **Step 5: 运行 npm workflow contract**

Run: `cd deploy-center--tianweilong && node --test tests/npm-release-workflow.mjs`

Expected: PASS。

## Task 8: 让旧 release matrix 退出主路径

**Files:**
- Modify: `deploy-center--tianweilong/.github/workflows/validate-deployment-config.yml`
- Modify: `deploy-center--tianweilong/tests/release-workflow.mjs`
- Modify: `deploy-center--tianweilong/tests/prepare-release-matrix.mjs`
- Modify: `deploy-center--tianweilong/tests/prepare-release-matrix-new-api.mjs`

- [x] **Step 1: 从 workflow contract 中禁止旧矩阵脚本**

In `tests/release-workflow.mjs`, add this forbidden pattern if not already present:

```js
  'node scripts/prepare-release-matrix.mjs',
```

Do not delete `scripts/prepare-release-matrix.mjs` in this task. It remains as a legacy helper covered by its existing tests, but active workflow must not call it.

- [x] **Step 2: Remove tests that accept invalid input tags as release tags**

In `tests/prepare-release-matrix.mjs`, remove cases that set `SOURCE_TAG: 'latest'` and expect image tag `latest`. Delete the test blocks that currently assert `assert.equal(imageA.tag, 'latest')`, `assert.equal(imageB.tag, 'latest')`, or `assert.equal(bitwarden.tag, 'latest')`.

Do not add new validation responsibility to `prepare-release-matrix.mjs`; tag validation now belongs to `resolve-release-request.mjs`.

- [x] **Step 3: 保留旧脚本语法检查**

Keep this line in `.github/workflows/validate-deployment-config.yml` because the legacy script still exists:

```yaml
          node --check scripts/prepare-release-matrix.mjs
```

- [x] **Step 4: Run release matrix tests**

Run:

```bash
cd deploy-center--tianweilong
node --test tests/prepare-release-matrix.mjs
node --test tests/prepare-release-matrix-new-api.mjs
```

Expected: PASS。

## Task 9: 更新 README 文档

**Files:**
- Modify: `deploy-center--tianweilong/README.md`

- [x] **Step 1: Rewrite release model section**

Replace the old “统一发布模型”、“npm 版本映射规则”、“镜像构建平台”、“npm 打包说明” content with the new contract:

```md
## 统一发布模型

业务仓在推送正式 tag 后向本仓库发送 `repository_dispatch`。payload 只包含：

- `service_name`
- `source_ref`
- `source_sha`
- `source_tag`

`source_tag` 必须匹配 `vYYYY.M.D-HHmm`，例如 `v2026.4.19-1116`。`latest`、`vX.Y.Z` 和 `2026.04.19.1` 这类旧格式不能作为输入 tag。

服务的源码仓、Dockerfile、GHCR 镜像仓库、npm 包名、npm 包目录和 npm 版本策略由 `config/services.yaml` 维护。

## 镜像发布

镜像服务只发布到 GHCR。构建成功后会推送两个 tag：

- `${SOURCE_TAG}`：不可变正式发布 tag。
- `latest`：供 `docker-compose.yaml` 使用，便于拉取最新镜像而不改 compose 文件。

当前不执行 ACR mirror，也不更新 candidate release 或触发测试环境部署。

## npm 发布

npm 服务使用 `calendar_tag` 版本策略：`v2026.4.19-1116` 会发布为 npm version `2026.4.19-1116`。

该版本在 npm 语义中属于 prerelease，因此发布时显式使用 `--tag latest`。这是本仓库的产品约定：内部工具通过 `npm install <pkg>` 或 `npx <pkg>` 默认获取最新 calendar 发布版本。
```

- [x] **Step 2: 运行 README 文案定位测试**

Run: `cd deploy-center--tianweilong && node --test tests/localization-language.mjs`

Expected: PASS。

## Task 10: 全量验证

**Files:**
- Validate all modified files.

- [x] **Step 1: 运行核心新增测试**

Run:

```bash
cd deploy-center--tianweilong
node --test tests/resolve-release-request.mjs
node --test tests/test-npm-release-common.mjs
node --test tests/prepare-npm-publish-input-version-sync.mjs
node --test tests/publish-npm-package-dist-tag.mjs
```

Expected: all PASS。

- [x] **Step 2: 运行 workflow contract 测试**

Run:

```bash
cd deploy-center--tianweilong
node --test tests/release-workflow.mjs
node --test tests/npm-release-workflow.mjs
```

Expected: both PASS。

- [x] **Step 3: 运行全部 Node 测试**

Run:

```bash
cd deploy-center--tianweilong
for test_file in tests/*.mjs; do
  [ "${test_file}" = "tests/helpers.mjs" ] && continue
  echo "== ${test_file} =="
  node --test "${test_file}"
done
```

Expected: every test command exits 0。

- [x] **Step 4: 运行脚本语法检查**

Run:

```bash
cd deploy-center--tianweilong
node --check scripts/resolve-release-request.mjs
node --check scripts/npm-release-common.mjs
node --check scripts/prepare-npm-publish-input.mjs
node --check scripts/build-npm-release-assets.mjs
node --check scripts/publish-npm-package.mjs
node --check scripts/merge-release-checksums.mjs
node --check scripts/release-meta.mjs
node --check scripts/validate-npm-build-contract.mjs
ruby -e "require 'yaml'; Dir['**/*.yaml'].each { |f| YAML.load_file(f); puts f }"
```

Expected: all commands exit 0。

- [x] **Step 5: 检查不应存在的主路径引用**

Run:

```bash
cd deploy-center--tianweilong
rg -n "release_targets|npm_base_version_file|npm_version_patch_factor|mirror-to-acr|update-candidate|deploy-test|config/services\.\$\{source_repository_name\}\.json" .github scripts tests README.md
```

Expected: no output for active workflow/scripts/docs. If legacy tests intentionally mention old strings as forbidden patterns, keep only those test assertions and ensure they are under `assertNotContains`.
