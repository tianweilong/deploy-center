# release-service npm 支持 Linux 与 Windows 平台 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `release-service` 中的 npm 发布流程从单个 macOS job 直接发布，改为 Linux / Windows 分平台构建后统一发布到 npm，并保持现有发布输入与版本策略字段不变。

**Architecture:** `prepare` job 新增 npm 平台矩阵输出，`release-npm` 拆成构建与发布两个阶段。构建阶段在 `ubuntu-latest` 与 `windows-latest` 上分别生成平台制品并上传 artifact；发布阶段下载全部 artifact，复用现有版本计算与 Trusted Publishing 逻辑执行一次统一发布。

**Tech Stack:** GitHub Actions YAML、Bash、npm、pnpm、GitHub Actions Artifacts

---

### Task 1: 先用测试锁定新的 workflow 结构

**Files:**
- Modify: `tests/release-workflow.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing workflow assertions**

在 `tests/release-workflow.sh` 中加入或替换为以下断言：

```bash
grep -q 'release-npm-build:' "$file"
grep -q 'release-npm-publish:' "$file"
grep -q 'windows-latest' "$file"
grep -q 'ubuntu-latest' "$file"
grep -q 'download-artifact' "$file"
grep -q 'upload-artifact' "$file"
```

并删除“只存在单个 `release-npm:` job”的旧断言。

**Step 2: Write the failing script assertions**

在 `tests/npm-release-workflow.sh` 中加入脚本模式断言，例如：

```bash
grep -q 'BUILD_ONLY' "$script"
grep -q 'PUBLISH_ONLY' "$script"
grep -q 'TARGET_OS' "$script"
grep -q 'TARGET_ARCH' "$script"
```

若最终采用子命令而不是环境变量，可把断言改成子命令关键词，但必须先写出会失败的测试。

**Step 3: Run tests to verify they fail**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，失败点来自 workflow 尚未拆分 build/publish，且脚本尚不支持分阶段模式。

**Step 4: Re-run to confirm failure reason**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，报错仍然聚焦在新加的矩阵 / artifact / 分阶段断言。

### Task 2: 给 prepare job 增加 npm 平台矩阵输出

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Add prepare outputs**

在 `prepare.outputs` 下新增 npm 平台矩阵字段，例如：

```yaml
      npm_matrix: ${{ steps.matrix.outputs.npm_matrix }}
```

**Step 2: Emit npm matrix JSON**

在现有 `matrix` 步骤中，为 npm 目标额外输出 JSON，首版固定为：

```json
{"include":[
  {"runner":"ubuntu-latest","target_os":"linux","target_arch":"x64"},
  {"runner":"windows-latest","target_os":"win32","target_arch":"x64"}
]}
```

若 `has_npm != 'true'`，输出空矩阵 `{"include":[]}`。

**Step 3: Run targeted workflow test**

Run: `bash tests/release-workflow.sh`
Expected: 仍可能 FAIL，但失败点应从“缺少矩阵”推进到“尚未拆分 job / 缺少 artifact 步骤”。

### Task 3: 先把脚本改成可只构建不发布

**Files:**
- Modify: `scripts/release-npm-package.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Introduce explicit build mode**

在脚本中加入构建模式开关，至少让下面这类逻辑成立：

```bash
if [ "${BUILD_ONLY:-false}" = 'true' ]; then
  echo "仅构建 ${TARGET_OS}-${TARGET_ARCH} 制品，不执行发布。"
  exit 0
fi
```

但在真正 `exit 0` 前，要保留版本计算、`pnpm run build:npx`、`npm version`、`npm pack` 与产物输出逻辑。

**Step 2: Plumb platform variables**

在脚本前部增加：

```bash
TARGET_OS="${TARGET_OS:-}"
TARGET_ARCH="${TARGET_ARCH:-}"
```

并把它们传给构建命令，例如：

```bash
TARGET_OS="${TARGET_OS}" TARGET_ARCH="${TARGET_ARCH}" pnpm run build:npx
```

**Step 3: Run targeted script test**

Run: `bash tests/npm-release-workflow.sh`
Expected: 仍可能 FAIL，但失败点应推进到“尚未支持 publish-only / workflow 尚未接线”。

### Task 4: 再把脚本补成可只发布已准备产物

**Files:**
- Modify: `scripts/release-npm-package.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Add publish-only mode**

为脚本增加发布模式开关，例如：

```bash
if [ "${PUBLISH_ONLY:-false}" = 'true' ]; then
  PACKAGE_FILE="${PACKAGE_FILE:?缺少 PACKAGE_FILE}"
  npm publish "$PACKAGE_FILE" --access public
  exit 0
fi
```

若最终实现需要支持多个 `tgz` 一起汇总，再把模式扩展为读取目录而非单个文件，但仍保持测试先锁定入口。

**Step 2: Keep version and duplicate checks**

即使是发布模式，也保留：

```bash
npm view "${actual_package_name}@${PUBLISH_VERSION}" version >/dev/null 2>&1
```

这样可以继续避免重复发布。

**Step 3: Run targeted script test**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS 或仅剩 workflow 结构断言失败。

### Task 5: 将单个 release-npm job 拆成 build / publish 两段

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Replace single job with matrix build job**

把当前：

```yaml
  release-npm:
    runs-on: macos-15
```

替换为：

```yaml
  release-npm-build:
    strategy:
      matrix: ${{ fromJSON(needs.prepare.outputs.npm_matrix) }}
    runs-on: ${{ matrix.runner }}
```

并把 `TARGET_OS`、`TARGET_ARCH`、`BUILD_ONLY=true` 传给脚本。

**Step 2: Upload per-platform artifacts**

在每个矩阵实例完成后加入 artifact 上传步骤，命名中包含平台信息，例如：

```yaml
name: npm-package-${{ matrix.target_os }}-${{ matrix.target_arch }}
```

**Step 3: Add final publish job**

新增：

```yaml
  release-npm-publish:
    needs: release-npm-build
    runs-on: ubuntu-latest
```

在这个 job 中下载全部 artifact，并调用脚本的发布模式。

**Step 4: Run targeted workflow test**

Run: `bash tests/release-workflow.sh`
Expected: PASS

### Task 6: 同步开发文档

**Files:**
- Modify: `docs/developer-guide.md`
- Test: `docs/developer-guide.md`

**Step 1: Update release-npm section**

将文档中仍描述为：

```md
release-npm 任务运行在带 self-hosted、macOS、ARM64 标签的自托管 Runner 上
```

的内容改为 Linux / Windows 分平台构建、统一发布的描述。

**Step 2: Document platform targets**

在 npm 发布章节补充本次首版支持的目标：

```md
- linux-x64
- win32-x64
```

并说明 Windows 以 `win32` / `x64` 表示。

**Step 3: Verify docs**

Run: `rg -n "self-hosted|macOS|windows-latest|win32|linux-x64|win32-x64|release-npm-build|release-npm-publish" docs/developer-guide.md .github/workflows/release-service.yml`
Expected: 文档与 workflow 描述一致，不再残留旧的单 macOS job 说法。

### Task 7: 完整验证

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

Run: `git diff -- .github/workflows/release-service.yml scripts/release-npm-package.sh tests/release-workflow.sh tests/npm-release-workflow.sh docs/developer-guide.md docs/plans/2026-03-15-release-service-npm-linux-windows-design.md docs/plans/2026-03-15-release-service-npm-linux-windows.md`
Expected: 只包含 npm 多平台发布相关变更。

**Step 3: Inspect working tree**

Run: `git status --short`
Expected: 仅出现本次相关文件。
