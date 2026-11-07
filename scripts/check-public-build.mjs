import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = walk('dist');
if (files.some(path => /sc-local|starcraft1/i.test(path))) throw new Error('Local-only pack leaked into build');
// Compare hashes too: an accidental rename must not bypass the public boundary.
let local = [];
try { local = walk('public/assets/sc-local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const forbidden = new Set(local.map(hash));
if (files.some(path => forbidden.has(hash(path)))) throw new Error('Local-only asset contents leaked into build');
console.log(`Public build checked: ${files.length} files, no local-only asset path or content.`);
