# release-service npm 改为 GitHub Release 平台分发 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `release-service` 中的 npm 发布流程从“把多平台产物合并进一个 npm 包”调整为“构建平台资产上传到 GitHub Release，再发布安装时按平台下载资产的轻量 npm 包”，并支持单个公开 GitHub 仓库存储多个 npm 包的 release。

**Architecture:** workflow 增加 `npm_release_package_key` 与 `npm_release_repository` 两个显式输入，先按 `linux-x64`、`win32-x64`、`darwin-arm64` 矩阵构建平台资产并上传到 GitHub Release，release tag 采用 `<package-key>-vX.Y.Z`。npm 包本身只保留安装期下载逻辑，因此最终用户安装时只会请求当前平台对应的一个 GitHub Release 资产。

**Tech Stack:** GitHub Actions YAML、Bash、GitHub Releases、npm、shell tests

---

### Task 1: 先用测试锁定新的 GitHub Release 分发目标

**Files:**
- Modify: `tests/release-workflow.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing workflow assertions**

在 `tests/release-workflow.sh` 中新增断言：

```bash
grep -q 'npm_release_package_key' "$file"
grep -q 'npm_release_repository' "$file"
grep -q 'darwin-arm64' "$file"
grep -q 'release-github-release:' "$file"
grep -q 'gh release create' "$file"
```

并删除当前“把多平台构建产物重新合并进统一 npm 包”的旧断言。

**Step 2: Write the failing script assertions**

在 `tests/npm-release-workflow.sh` 中新增断言：

```bash
grep -q 'NPM_RELEASE_PACKAGE_KEY' "$script"
grep -q 'NPM_RELEASE_REPOSITORY' "$script"
grep -q 'checksums.txt' "$script"
```

如果实现最终采用辅助脚本而不是扩展现有脚本，则把断言改到对应新文件，但必须先写失败测试。

**Step 3: Run tests to verify they fail**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，失败点来自 workflow 尚未声明 GitHub Release 输入、尚未包含 `darwin-arm64` 与 GitHub Release 发布逻辑。

**Step 4: Re-run to confirm failure reason**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，报错仍聚焦于新增的 Release 分发断言。

### Task 2: 调整 workflow 输入与平台矩阵

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Add explicit workflow inputs**

在 workflow 输入与顶层环境变量中新增：

```yaml
      npm_release_package_key:
        description: npm Release 包标识
      npm_release_repository:
        description: npm Release 公开仓库
```

并将它们透传到 `env`。

**Step 2: Expand npm matrix**

将 npm 平台矩阵调整为：

```json
{"include":[
  {"runner":"ubuntu-latest","target":"linux-x64","target_os":"linux","target_arch":"x64","archive_ext":"tar.gz"},
  {"runner":"windows-latest","target":"win32-x64","target_os":"win32","target_arch":"x64","archive_ext":"zip"},
  {"runner":"macos-15","target":"darwin-arm64","target_os":"darwin","target_arch":"arm64","archive_ext":"tar.gz"}
]}
```

**Step 3: Run targeted workflow test**

Run: `bash tests/release-workflow.sh`
Expected: 仍 FAIL，但失败点已从“缺输入 / 缺 darwin-arm64”推进到“缺 GitHub Release job”。

### Task 3: 先把脚本切到“输出平台资产”而不是“重新打统一 npm 包”

**Files:**
- Modify: `scripts/release-npm-package.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Add release metadata envs**

在脚本开头增加：

```bash
NPM_RELEASE_PACKAGE_KEY="${NPM_RELEASE_PACKAGE_KEY:-}"
NPM_RELEASE_REPOSITORY="${NPM_RELEASE_REPOSITORY:-}"
```

**Step 2: Produce named platform asset**

将当前 build-only 阶段输出改为生成命名明确的压缩包，而不是复制整个 `package` 目录。例如最终文件名规则应等价于：

```bash
asset_name="${NPM_RELEASE_PACKAGE_KEY}-${SOURCE_TAG}-${TARGET_OS}-${TARGET_ARCH}.${archive_ext}"
```

实现时应把 `SOURCE_TAG` 统一转换为 `<package-key>-vX.Y.Z` 对应的 release tag，再映射成资产文件名前缀。

**Step 3: Emit checksums**

在构建阶段为每个平台资产输出校验值，或为后续汇总 `checksums.txt` 做准备。

**Step 4: Run targeted script test**

Run: `bash tests/npm-release-workflow.sh`
Expected: 仍 FAIL，但失败点应推进到“缺 GitHub Release 上传 / npm 轻量包发布逻辑”。

### Task 4: 把 workflow 改成“先发 GitHub Release，再发 npm”

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Rename build stage**

把现有 `release-npm-build` 调整为更明确的资产构建阶段，例如：

```yaml
  release-npm-assets:
```

并确保它只负责平台资产构建与 artifact 上传。

**Step 2: Add GitHub Release job**

新增：

```yaml
  release-github-release:
```

该 job 需要：

- 下载全部平台 artifact
- 生成 `<package-key>-vX.Y.Z` tag
- 使用 `gh release create` 或等价方式创建 / 发布 release
- 上传平台资产和 `checksums.txt`

**Step 3: Add final lightweight npm publish job**

保留最终 `release-npm` job，但职责改成发布轻量 npm 包，不再重新合并平台资产。

**Step 4: Run targeted workflow test**

Run: `bash tests/release-workflow.sh`
Expected: PASS

### Task 5: 同步开发文档到 GitHub Release 分发语义

**Files:**
- Modify: `docs/developer-guide.md`
- Test: `docs/developer-guide.md`

**Step 1: Replace old npm section**

将当前仍描述为“多平台构建后统一打入 npm 包”的内容，改成：

- GitHub Release 资产构建
- GitHub Release 发布
- 轻量 npm 包发布
- 安装时按平台下载

**Step 2: Document tag and asset naming**

在文档中明确写出：

```text
<package-key>-vX.Y.Z
<package-key>-vX.Y.Z-linux-x64.tar.gz
<package-key>-vX.Y.Z-win32-x64.zip
<package-key>-vX.Y.Z-darwin-arm64.tar.gz
```

**Step 3: Verify docs**

Run: `rg -n "npm_release_package_key|npm_release_repository|darwin-arm64|release-github-release|安装时下载|GitHub Release" docs/developer-guide.md .github/workflows/release-service.yml`
Expected: 文档与 workflow 描述一致，不再残留“统一 npm tarball”语义。

### Task 6: 完整验证

**Files:**
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`
- Test: `.github/workflows/release-service.yml`
- Test: `scripts/release-npm-package.sh`
- Test: `docs/developer-guide.md`

**Step 1: Run final verification**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 2: Inspect focused diff**

Run: `git diff -- .github/workflows/release-service.yml scripts/release-npm-package.sh tests/release-workflow.sh tests/npm-release-workflow.sh docs/developer-guide.md docs/plans/2026-03-15-release-service-npm-github-release-design.md docs/plans/2026-03-15-release-service-npm-github-release.md`
Expected: 只包含 GitHub Release 平台分发相关改动。

**Step 3: Inspect working tree**

Run: `git status --short`
Expected: 仅出现本次相关文件。
