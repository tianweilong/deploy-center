import { assertContains, readRepoFile } from './helpers.mjs';

const servicesConfig = await readRepoFile('config/services.yaml');

for (const image of [
  'ghcr.io/tianweilong/vibe-kanban-remote',
  'ghcr.io/tianweilong/vibe-kanban-relay',
  'ghcr.io/tianweilong/new-api',
  'ghcr.io/tianweilong/lobehub',
  'ghcr.io/tianweilong/paradedb-pg17',
  'ghcr.io/tianweilong/azure-storage-azurite',
  'ghcr.io/tianweilong/azure-cli',
  'ghcr.io/tianweilong/electricsql-electric',
  'ghcr.io/tianweilong/nginx',
  'ghcr.io/tianweilong/bitwarden',
  'ghcr.io/tianweilong/redis7',
  'ghcr.io/tianweilong/searxng',
  'ghcr.io/tianweilong/we-mp-rss',
  'ghcr.io/tianweilong/cli-proxy-api',
]) {
  assertContains(servicesConfig, image);
}

assertContains(await readRepoFile('README.md'), 'ghcr.io');
assertContains(await readRepoFile('README.md'), 'packages: write');
assertContains(await readRepoFile('docs/architecture.md'), 'GitHub Container Registry');
assertContains(await readRepoFile('docs/rollout.md'), 'read:packages');
