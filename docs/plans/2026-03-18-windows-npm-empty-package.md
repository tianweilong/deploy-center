# Windows npm 空包修复 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Windows npm Release zip 为空且 GitHub Release 泄漏裸文件的问题。

**Architecture:** 保持现有多平台发布流程不变，只调整两个局部点：一是 `release-npm-assets` 仅上传压缩包和校验文件，切断 `stage/` 原始文件泄漏；二是重写 `scripts/release-npm-package.sh` 的 Windows zip 生成方式，避免直接依赖 `C:\path\*` 通配输入。

**Tech Stack:** GitHub Actions YAML、Bash、PowerShell、shell 测试

---

### Task 1: 锁定 artifact 上传边界

**Files:**
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: 写失败测试**

在 `tests/npm-release-workflow.sh` 中增加断言，要求 workflow 的 `upload-artifact` 不能继续上传整个 `npm-artifacts/${{ matrix.target }}` 目录，而必须只上传压缩包和校验文件。

**Step 2: 运行测试确认失败**

Run: `bash tests/npm-release-workflow.sh`
Expected: FAIL，指出 workflow 仍在上传整个目录。

**Step 3: 做最小实现**

修改 `.github/workflows/release-service.yml` 的 artifact 上传路径，只保留压缩包和 `checksums.txt`。

**Step 4: 运行测试确认通过**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

### Task 2: 锁定 stage 泄漏

**Files:**
- Modify: `tests/release-npm-package-artifact-path.sh`
- Modify: `scripts/release-npm-package.sh`
- Test: `tests/release-npm-package-artifact-path.sh`

**Step 1: 写失败测试**

给 `tests/release-npm-package-artifact-path.sh` 增加断言，要求 `BUILD_ONLY=true` 结束后 `artifact_dir/stage` 不存在。

**Step 2: 运行测试确认失败**

Run: `bash tests/release-npm-package-artifact-path.sh`
Expected: FAIL，指出 `stage/` 仍然残留。

**Step 3: 做最小实现**

在打包脚本中，完成压缩和 checksum 后删除 `stage/`。

**Step 4: 运行测试确认通过**

Run: `bash tests/release-npm-package-artifact-path.sh`
Expected: PASS

### Task 3: 锁定 Windows zip 创建逻辑

**Files:**
- Modify: `tests/npm-release-workflow.sh`
- Modify: `scripts/release-npm-package.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: 写失败测试**

在 `tests/npm-release-workflow.sh` 中增加断言，禁止脚本继续使用 `Compress-Archive -Path '$source_dir_windows\\*'` 这一实现。

**Step 2: 运行测试确认失败**

Run: `bash tests/npm-release-workflow.sh`
Expected: FAIL，指出脚本仍使用旧的 Windows 通配路径。

**Step 3: 做最小实现**

将 Windows 分支改为在 PowerShell 中进入源目录后，基于目录内容构造 `Compress-Archive` 输入，避免直接把带 `*` 的绝对路径作为参数。

**Step 4: 运行测试确认通过**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

### Task 4: 全量验证

**Files:**
- Test: `tests/npm-release-workflow.sh`
- Test: `tests/release-npm-package-artifact-path.sh`

**Step 1: 运行验证命令**

Run: `bash tests/npm-release-workflow.sh && bash tests/release-npm-package-artifact-path.sh`
Expected: PASS
