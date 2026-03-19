# scripts 统一为 Node.js ESM Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `scripts/` 目录中的 Ruby 和 Bash 脚本一次性迁移为 Node.js ESM 脚本，并同步更新测试、workflow 与文档。

**Architecture:** 保持现有脚本职责拆分不变，仅统一运行时到 Node.js ESM。通过新增 `npm-release-common.mjs` 作为公共模块，逐步替换原有 Ruby/Bash 脚本，并让测试与 workflow 最终只依赖 `node scripts/*.mjs`。

**Tech Stack:** Node.js ESM、`node:fs/promises`、`node:path`、`node:child_process`、GitHub Actions YAML、Node 测试

---

### Task 1: 锁定旧脚本已被完全替换的失败测试

**Files:**
- Modify: `tests/npm-release-workflow.sh`
- Modify: `tests/release-workflow.sh`
- Modify: `tests/prepare-release-matrix.sh`

**Step 1: 写失败测试**

更新测试，加入以下断言：

- workflow 不再引用 `scripts/*.sh` 和 `scripts/prepare-release-matrix.rb`
- workflow 统一引用 `node scripts/*.mjs`
- `prepare-release-matrix` 的测试入口改为 Node 版本

**Step 2: 运行测试确认失败**

Run: `bash tests/npm-release-workflow.sh && bash tests/release-workflow.sh && bash tests/prepare-release-matrix.sh`

Expected: FAIL，指出旧入口仍被引用。

**Step 3: 最小实现**

只修改测试，不修改生产脚本，让失败稳定暴露真实残留引用。

**Step 4: 再次运行测试**

Run: `bash tests/npm-release-workflow.sh && bash tests/release-workflow.sh && bash tests/prepare-release-matrix.sh`

Expected: FAIL，且失败信息稳定指向旧脚本引用。

### Task 2: 为公共 Node 模块补失败测试

**Files:**
- Create: `tests/test-npm-release-common.mjs`
- Modify: `tests/test-release-meta.mjs`
- Modify: `tests/test-npm-build-contract.mjs`

**Step 1: 写失败测试**

在 `tests/test-npm-release-common.mjs` 中覆盖：

- 路径解析
- 平台目录映射
- 版本策略解析
- release payload 构造
- checksum 生成辅助函数

必要时补充现有 Node 单测，约束迁移后公共模块导出接口。

**Step 2: 运行测试确认失败**

Run: `node --test tests/test-npm-release-common.mjs tests/test-release-meta.mjs tests/test-npm-build-contract.mjs`

Expected: FAIL，因为 `scripts/npm-release-common.mjs` 尚不存在或导出不完整。

**Step 3: 最小实现**

创建最小测试骨架，确保失败点聚焦到缺失实现。

**Step 4: 再次运行测试**

Run: `node --test tests/test-npm-release-common.mjs tests/test-release-meta.mjs tests/test-npm-build-contract.mjs`

Expected: FAIL，且失败点与预期一致。

### Task 3: 迁移 prepare-release-matrix 到 Node

**Files:**
- Create: `scripts/prepare-release-matrix.mjs`
- Modify: `tests/prepare-release-matrix.sh`
- Modify: `tests/prepare-release-matrix-new-api.sh`
- Modify: `.github/workflows/release-service.yml`
- Modify: `.github/workflows/validate-deployment-config.yml`

**Step 1: 写最小实现**

在 `scripts/prepare-release-matrix.mjs` 中实现：

- 读取配置文件
- 解析 `TARGET_SERVICES`
- 校验构建参数环境变量
- 生成与 Ruby 版本一致的 JSON 输出

**Step 2: 运行定向测试**

Run: `bash tests/prepare-release-matrix.sh && bash tests/prepare-release-matrix-new-api.sh`

Expected: PASS

**Step 3: 更新 workflow 引用**

将 workflow 中对 `ruby scripts/prepare-release-matrix.rb` 的调用改为 `node scripts/prepare-release-matrix.mjs`。

**Step 4: 再次运行测试**

Run: `bash tests/prepare-release-matrix.sh && bash tests/prepare-release-matrix-new-api.sh && bash tests/release-workflow.sh`

Expected: PASS，或仅剩 npm 发布脚本旧引用导致的失败。

### Task 4: 实现 npm 公共模块并让单测通过

**Files:**
- Create: `scripts/npm-release-common.mjs`
- Create: `tests/test-npm-release-common.mjs`
- Modify: `scripts/release-meta.mjs`

**Step 1: 实现公共模块**

至少导出：

- 路径解析函数
- 平台目录映射函数
- 版本策略解析函数
- release payload 构造函数
- 子进程执行辅助函数
- 文件复制/目录准备辅助函数

必要时让 `scripts/release-meta.mjs` 复用公共逻辑，避免重复。

**Step 2: 运行 Node 单测**

Run: `node --test tests/test-npm-release-common.mjs tests/test-release-meta.mjs tests/test-npm-build-contract.mjs`

Expected: PASS

### Task 5: 迁移 prepare-npm-publish-input 到 Node

**Files:**
- Create: `scripts/prepare-npm-publish-input.mjs`
- Modify: `tests/npm-release-workflow.sh`
- Modify: `.github/workflows/release-service.yml`
- Modify: `.github/workflows/validate-deployment-config.yml`

**Step 1: 写最小实现**

在 Node 版本中实现：

- 初始化发布上下文
- 执行 `pnpm i --frozen-lockfile`
- 执行 `pnpm run build:npx`
- 复制 package 内容
- 写入 `release-meta.json`
- 写入 `publish-context.json`
- 写入 `manifest.txt`

**Step 2: 运行定向验证**

Run: `bash tests/npm-release-workflow.sh`

Expected: 仍可能 FAIL，但失败点应转移到其余旧脚本引用。

### Task 6: 迁移 merge-release-checksums 到 Node

**Files:**
- Create: `scripts/merge-release-checksums.mjs`
- Modify: `tests/merge-release-checksums.sh`
- Modify: `.github/workflows/release-service.yml`
- Modify: `.github/workflows/validate-deployment-config.yml`

**Step 1: 写最小实现**

实现：

- 递归扫描 checksum 文件
- 校验文件名一致
- 合并排序去重
- 删除分散 checksum 文件

**Step 2: 运行定向测试**

Run: `bash tests/merge-release-checksums.sh`

Expected: PASS

### Task 7: 迁移 build-npm-release-assets 到 Node

**Files:**
- Create: `scripts/build-npm-release-assets.mjs`
- Modify: `tests/release-npm-package-artifact-path.sh`
- Modify: `tests/npm-release-zip-validation.sh`
- Modify: `tests/npm-release-workflow.sh`
- Modify: `.github/workflows/release-service.yml`

**Step 1: 写失败回归测试**

确保测试覆盖：

- 平台目录映射
- manifest 校验
- zip 至少包含 `manifest.json` 和平台文件
- 资产命名与 checksum 位置

**Step 2: 运行测试确认失败**

Run: `bash tests/release-npm-package-artifact-path.sh && bash tests/npm-release-zip-validation.sh`

Expected: FAIL，因为 Node 版本尚未完整实现。

**Step 3: 实现最小 Node 版本**

完成构建、校验、复制、归档、checksum 生成。

**Step 4: 再次运行测试**

Run: `bash tests/release-npm-package-artifact-path.sh && bash tests/npm-release-zip-validation.sh`

Expected: PASS

### Task 8: 迁移 publish-npm-package 到 Node

**Files:**
- Create: `scripts/publish-npm-package.mjs`
- Modify: `tests/npm-release-workflow.sh`
- Modify: `.github/workflows/release-service.yml`

**Step 1: 写最小实现**

实现：

- 输入目录与 manifest 校验
- `npm version`
- `npm pack`
- `npm view` 幂等检查
- `npm publish`

**Step 2: 运行定向测试**

Run: `bash tests/npm-release-workflow.sh`

Expected: PASS，workflow 文本断言切换到 Node 入口。

### Task 9: 全量更新 workflow、文档和测试命令

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Modify: `.github/workflows/validate-deployment-config.yml`
- Modify: `docs/developer-guide.md`
- Modify: `tests/release-workflow.sh`
- Modify: `tests/npm-release-workflow.sh`

**Step 1: 统一调用入口**

将所有脚本调用与校验命令更新为：

- `node scripts/prepare-release-matrix.mjs`
- `node scripts/prepare-npm-publish-input.mjs`
- `node scripts/build-npm-release-assets.mjs`
- `node scripts/publish-npm-package.mjs`
- `node scripts/merge-release-checksums.mjs`

**Step 2: 运行引用检查**

Run: `rg -n "scripts/.*\\.(sh|rb)|bash -n scripts|ruby scripts" .github tests docs scripts`

Expected: 不再有有效残留引用，仅允许文档设计稿中出现历史说明。

### Task 10: 删除旧 Bash 与 Ruby 脚本

**Files:**
- Delete: `scripts/prepare-release-matrix.rb`
- Delete: `scripts/npm-release-common.sh`
- Delete: `scripts/prepare-npm-publish-input.sh`
- Delete: `scripts/build-npm-release-assets.sh`
- Delete: `scripts/publish-npm-package.sh`
- Delete: `scripts/merge-release-checksums.sh`

**Step 1: 删除旧文件**

删除所有被替换的旧脚本文件。

**Step 2: 运行引用检查**

Run: `rg -n "prepare-release-matrix\\.rb|npm-release-common\\.sh|prepare-npm-publish-input\\.sh|build-npm-release-assets\\.sh|publish-npm-package\\.sh|merge-release-checksums\\.sh" .`

Expected: 仅允许在设计文档中出现历史迁移说明。

### Task 11: 全量验证

**Files:**
- Test: `tests/prepare-release-matrix.sh`
- Test: `tests/prepare-release-matrix-new-api.sh`
- Test: `tests/merge-release-checksums.sh`
- Test: `tests/release-npm-package-artifact-path.sh`
- Test: `tests/npm-release-zip-validation.sh`
- Test: `tests/npm-release-workflow.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/test-npm-release-common.mjs`
- Test: `tests/test-release-meta.mjs`
- Test: `tests/test-npm-build-contract.mjs`

**Step 1: 运行 Node 单测**

Run: `node --test tests/test-npm-release-common.mjs tests/test-release-meta.mjs tests/test-npm-build-contract.mjs`

Expected: PASS

**Step 2: 运行回归测试**

Run: `bash tests/prepare-release-matrix.sh && bash tests/prepare-release-matrix-new-api.sh && bash tests/merge-release-checksums.sh && bash tests/release-npm-package-artifact-path.sh && bash tests/npm-release-zip-validation.sh && bash tests/npm-release-workflow.sh && bash tests/release-workflow.sh`

Expected: PASS

**Step 3: 检查最终差异**

Run: `git diff -- .github/workflows docs/developer-guide.md scripts tests docs/plans/2026-03-19-scripts-unification-design.md docs/plans/2026-03-19-scripts-unification.md`

Expected: 只包含统一脚本运行时到 Node.js ESM 的相关改动。
