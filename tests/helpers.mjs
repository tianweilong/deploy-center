import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const testsDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(testsDir, '..');

export async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

export async function assertFileExists(relativePath) {
  await stat(path.join(repoRoot, relativePath));
}

export async function assertFileNotExists(relativePath) {
  await assert.rejects(() => stat(path.join(repoRoot, relativePath)));
}

export function runCommand(command, args, options = {}) {
  const mergedEnv = {
    ...process.env,
    ...(options.env ?? {}),
  };
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
    env: mergedEnv,
  });
}

export function runNode(args, options = {}) {
  return runCommand(process.execPath, args, options);
}

export async function createTempDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeTempFile(filePath, content) {
  await writeFile(filePath, content, 'utf8');
}

export async function copyDir(fromRelativePath, toAbsolutePath) {
  await cp(path.join(repoRoot, fromRelativePath), toAbsolutePath, { recursive: true });
}

export async function removeDir(targetPath) {
  await rm(targetPath, { recursive: true, force: true });
}

export function assertContains(content, pattern, message) {
  if (pattern instanceof RegExp) {
    assert.match(content, pattern, message);
    return;
  }
  assert.ok(content.includes(pattern), message ?? `期望包含：${pattern}`);
}

export function assertNotContains(content, pattern, message) {
  if (pattern instanceof RegExp) {
    assert.doesNotMatch(content, pattern, message);
    return;
  }
  assert.ok(!content.includes(pattern), message ?? `期望不包含：${pattern}`);
}
