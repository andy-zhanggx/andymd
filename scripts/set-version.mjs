#!/usr/bin/env node
// Bump the project version in every place it lives, keeping them in sync.
// AndyMD stores its version in three files; they MUST match or `tauri build`
// refuses to run. Usage:  node scripts/set-version.mjs <version>
//   e.g. node scripts/set-version.mjs 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: node scripts/set-version.mjs <semver>   e.g. 0.2.0');
  process.exit(1);
}

function patchJson(relPath) {
  // Targeted regex edit (not JSON.parse/stringify) so existing formatting —
  // inline arrays, indentation — is preserved. The top-level `"version"` key is
  // the first one in both package.json and tauri.conf.json.
  const file = join(root, relPath);
  const text = readFileSync(file, 'utf8');
  let old = null;
  const out = text.replace(/("version"\s*:\s*")([^"]*)(")/, (_m, pre, val, post) => {
    old = val;
    return pre + version + post;
  });
  if (old === null) throw new Error(`no "version" key in ${relPath}`);
  writeFileSync(file, out);
  return old;
}

function patchCargo(relPath) {
  const file = join(root, relPath);
  const text = readFileSync(file, 'utf8');
  // Replace the `version = "…"` line inside the [package] section only,
  // never the versions of dependencies in later sections.
  let inPackage = false;
  let old = null;
  const out = text
    .split('\n')
    .map((line) => {
      if (/^\[/.test(line)) inPackage = line.trim() === '[package]';
      if (inPackage) {
        const m = line.match(/^(\s*version\s*=\s*")([^"]*)(".*)$/);
        if (m) {
          old = m[2];
          return `${m[1]}${version}${m[3]}`;
        }
      }
      return line;
    })
    .join('\n');
  writeFileSync(file, out);
  return old;
}

const changes = [
  ['package.json', patchJson('package.json')],
  ['src-tauri/tauri.conf.json', patchJson('src-tauri/tauri.conf.json')],
  ['src-tauri/Cargo.toml', patchCargo('src-tauri/Cargo.toml')],
];

console.log(`Set version → ${version}`);
for (const [file, old] of changes) console.log(`  ${file}: ${old} → ${version}`);
console.log('\nNext: update CHANGELOG.md, commit, then `git tag v' + version + '`.');
