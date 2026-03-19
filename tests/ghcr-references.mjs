import { assertContains, assertNotContains, readRepoFile } from './helpers.mjs';

for (const file of [
  'README.md',
  'docs/rollout.md',
  'config/services.vibe-kanban.json',
  'config/services.new-api.json',
]) {
  assertNotContains(await readRepoFile(file), 'ccr.ccs.tencentyun.com');
}

assertNotContains(await readRepoFile('README.md'), 'TENCENT_REGISTRY');
assertNotContains(await readRepoFile('docs/rollout.md'), 'TENCENT_REGISTRY');

assertContains(
  await readRepoFile('config/services.vibe-kanban.json'),
  'ghcr.io/tianweilong/vibe-kanban-remote',
);
assertContains(
  await readRepoFile('config/services.vibe-kanban.json'),
  'ghcr.io/tianweilong/vibe-kanban-relay',
);
assertContains(
  await readRepoFile('config/services.new-api.json'),
  'ghcr.io/tianweilong/new-api',
);

assertContains(await readRepoFile('README.md'), 'GITHUB_TOKEN');
assertContains(await readRepoFile('README.md'), 'read:packages');
assertContains(await readRepoFile('docs/rollout.md'), 'read:packages');
