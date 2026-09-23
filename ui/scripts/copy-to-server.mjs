import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const uiDir = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(uiDir, 'dist');
const target = resolve(uiDir, '../server/frontend/dist');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
