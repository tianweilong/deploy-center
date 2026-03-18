# 移除旧版 npm 发布入口 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 删除 `scripts/release-npm-package.sh`，让 npm 发布链路只保留当前的公共脚本与三段式流程。

**Architecture:** 保持现有 workflow 输入和三段式发布架构不变，只移除旧入口并统一引用、测试和文档。所有 npm 发布约束都直接绑定到 `npm-release-common.sh`、`prepare-npm-publish-input.sh`、`build-npm-release-assets.sh`、`publish-npm-package.sh`。

**Tech Stack:** Bash、GitHub Actions YAML、shell 回归测试、文档维护

---

### Task 1: 先写删除旧入口的失败测试

**Files:**
- Modify: `tests/npm-release-workflow.sh`
- Modify: `tests/release-workflow.sh`

**Step 1: 写失败测试**

在 `tests/npm-release-workflow.sh` 中加入断言：

- `scripts/release-npm-package.sh` 不存在

在 `tests/release-workflow.sh` 中加入断言：

- 基础校验 workflow 不再引用 `bash -n scripts/release-npm-package.sh`

**Step 2: 运行测试确认失败**

Run: `bash tests/npm-release-workflow.sh && bash tests/release-workflow.sh`

Expected: FAIL，指出旧脚本仍存在或仍被校验链路引用。

**Step 3: 最小实现**

更新测试到新结构，不再接受旧脚本存在。

**Step 4: 再次运行测试**

Run: `bash tests/npm-release-workflow.sh && bash tests/release-workflow.sh`

Expected: 仍可能失败，但失败点应转移到真实残留引用，而不是测试本身语法问题。

### Task 2: 删除旧脚本并清理工作流校验

**Files:**
- Delete: `scripts/release-npm-package.sh`
- Modify: `.github/workflows/validate-deployment-config.yml`

**Step 1: 实现最小删除**

- 删除 `scripts/release-npm-package.sh`
- 从基础语法校验 workflow 中移除它

**Step 2: 运行失败测试**

Run: `bash tests/npm-release-workflow.sh && bash tests/release-workflow.sh`

Expected: 若还有残留引用则继续 FAIL，并指出具体文件。

### Task 3: 清理文档与测试里的旧入口说明

**Files:**
- Modify: `docs/developer-guide.md`
- Modify: `tests/npm-release-workflow.sh`
- Modify: `tests/release-npm-package-artifact-path.sh`

**Step 1: 清理说明**

- 删除开发者指南中“旧的兼容脚本入口”描述
- 删除本地维护命令中的 `bash -n scripts/release-npm-package.sh`
- 保证测试只围绕新脚本结构

**Step 2: 运行定向验证**

Run: `grep -R "release-npm-package.sh" -n .github scripts tests docs/developer-guide.md`

Expected: 不再出现运行链路、测试约束和开发指南中的有效引用。

### Task 4: 全量验证

**Files:**
- Test: `tests/npm-release-workflow.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/release-npm-package-artifact-path.sh`

**Step 1: 运行 shell 语法检查**

Run: `bash -n scripts/npm-release-common.sh && bash -n scripts/prepare-npm-publish-input.sh && bash -n scripts/build-npm-release-assets.sh && bash -n scripts/publish-npm-package.sh`

Expected: PASS

**Step 2: 运行回归测试**

Run: `bash tests/npm-release-workflow.sh && bash tests/release-workflow.sh && bash tests/release-npm-package-artifact-path.sh`

Expected: PASS

**Step 3: 检查差异**

Run: `git diff -- .github/workflows/validate-deployment-config.yml docs/developer-guide.md scripts tests`

Expected: 只包含删除旧脚本与统一到新结构的改动。
