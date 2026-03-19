import { assertContains, assertNotContains, readRepoFile } from './helpers.mjs';

assertContains(await readRepoFile('AGENTS.md'), '默认使用中文');
assertContains(await readRepoFile('AGENTS.md'), '代码内可见文案优先中文');
assertContains(await readRepoFile('AGENTS.md'), '测试相关文案优先中文');

const autoReject = [
  ['README.md', /^# Deploy Center$/m],
  ['README.md', 'Required repository secrets:'],
  ['docs/architecture.md', /^# Architecture$/m],
  ['docs/rollout.md', /^# Rollout Guide$/m],
  ['agents/webhook/README.md', /^# Webhook Agent$/m],
  ['agents/webhook/protocol.md', /^# Webhook Protocol$/m],
  ['.github/workflows/validate-deployment-config.yml', /^name: Validate Deployment Config$/m],
  ['.github/workflows/validate-deployment-config.yml', 'Validate deployment YAML'],
  ['.github/workflows/validate-deployment-config.yml', 'Validate helper scripts'],
  ['.github/workflows/release-service.yml', /^name: Release Service$/m],
  ['.github/workflows/release-service.yml', 'description: Source repository'],
  ['.github/workflows/release-service.yml', 'description: Source ref'],
  ['.github/workflows/release-service.yml', 'description: Source SHA'],
  ['.github/workflows/release-service.yml', 'description: Target environment'],
  ['.github/workflows/release-service.yml', 'description: Comma-separated services'],
  ['.github/workflows/release-service.yml', 'Validate release inputs'],
  ['.github/workflows/release-service.yml', 'Build service matrix'],
  ['.github/workflows/release-service.yml', 'Checkout source repository'],
  ['.github/workflows/release-service.yml', 'Setup SSH agent for private dependencies'],
  ['.github/workflows/release-service.yml', 'Setup QEMU'],
  ['.github/workflows/release-service.yml', 'Setup Docker Buildx'],
  ['.github/workflows/release-service.yml', 'Login to GitHub Container Registry'],
  ['.github/workflows/release-service.yml', 'Build and push image'],
  ['.github/workflows/release-service.yml', 'Missing required release input.'],
  ['scripts/prepare-release-matrix.mjs', 'Unsupported service:'],
  ['scripts/prepare-release-matrix.mjs', 'Missing required build arg env:'],
];

for (const [file, pattern] of autoReject) {
  assertNotContains(await readRepoFile(file), pattern);
}
