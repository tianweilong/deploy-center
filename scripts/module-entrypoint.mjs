#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function resolveEntryFileUrl(argvPath) {
  if (argvPath.startsWith('file://')) {
    return argvPath;
  }
  if (/^[A-Za-z]:[\\/]/.test(argvPath)) {
    return `file:///${argvPath.replace(/\\/g, '/')}`;
  }
  return pathToFileURL(path.resolve(argvPath)).href;
}

export function isMainModule(importMetaUrl, argvPath = process.argv[1]) {
  if (!importMetaUrl || !argvPath) {
    return false;
  }
  return importMetaUrl === resolveEntryFileUrl(argvPath);
}
