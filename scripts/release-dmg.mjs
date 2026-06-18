#!/usr/bin/env node
// Attach the locally-built macOS .dmg installers to this version's GitHub Release
// (the public download for users). One .dmg PER ARCHITECTURE:
//   pnpm version:set <x.y.z>
//   pnpm release:macos    # builds aarch64 + x64
//   pnpm release:dmg      # this script: upload both .dmg to the GitHub release
//
// Requires the GitHub CLI authenticated with push access (`gh auth status`).
// Repo via $GH_RELEASES_REPO (default andy-zhanggx/andymd) and MUST be public.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;
const repo = process.env.GH_RELEASES_REPO || 'andy-zhanggx/andymd';
const verRe = version.replace(/\./g, '\\.');

// One entry per architecture. `dmgArch` is the suffix Tauri puts in the .dmg
// filename for that target (aarch64 → "aarch64", x86_64 → "x64").
const ARCHES = [
  { triple: 'aarch64-apple-darwin', dmgArch: 'aarch64', label: 'Apple Silicon' },
  { triple: 'x86_64-apple-darwin',  dmgArch: 'x64',     label: 'Intel' },
];

// Locate each arch's .dmg (target/<triple>/release/bundle/dmg/AndyMD_<ver>_<dmgArch>.dmg).
const found = [];
for (const a of ARCHES) {
  const dir = join(root, `src-tauri/target/${a.triple}/release/bundle/dmg`);
  const re = new RegExp(`^AndyMD_${verRe}_${a.dmgArch}\\.dmg$`);
  let file;
  try { file = readdirSync(dir).find((f) => re.test(f)); } catch { /* not built */ }
  if (file) found.push({ ...a, path: join(dir, file), file });
  else console.warn(`⚠ no ${a.label} .dmg (AndyMD_${version}_${a.dmgArch}.dmg) in ${dir} — skipping`);
}
if (!found.length) die(`no per-arch .dmg found for ${version} — run \`pnpm release:macos\` first (is package.json at ${version}?)`);

const gh = (...args) => execFileSync('gh', args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

// Create the release if absent (release-update may also do this — idempotent).
let exists = true;
try { gh('release', 'view', tag, '--repo', repo); } catch { exists = false; }
if (!exists) {
  console.log(`↑ creating release ${tag} on ${repo}`);
  gh('release', 'create', tag, '--repo', repo, '--title', tag, '--notes', tag);
}

console.log(`↑ uploading ${found.map((f) => f.file).join(', ')} → ${repo}@${tag}`);
gh('release', 'upload', tag, ...found.map((f) => f.path), '--repo', repo, '--clobber');

for (const { file, label } of found) {
  console.log(`✓ ${file} (${label})`);
  console.log(`  download: https://github.com/${repo}/releases/download/${tag}/${file}`);
}
