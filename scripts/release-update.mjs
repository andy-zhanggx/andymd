#!/usr/bin/env node
// Publish the signed updater artifacts to public GitHub Releases so the in-app
// updater can fetch them anonymously (no token in the shipped app).
//
// We ship ONE artifact PER ARCHITECTURE so an updating Mac downloads only the
// slice it needs:
//   pnpm version:set <x.y.z>
//   TAURI_SIGNING_PRIVATE_KEY="$(cat andymd-updater.key)" \
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
//     pnpm release:macos        # builds + signs aarch64 + x64
//   pnpm release:update         # this script
//
// Requires the GitHub CLI authenticated with push access to the releases repo
// (`gh auth status` must be green). Repo is configured via $GH_RELEASES_REPO
// (default andy-zhanggx/andymd) and MUST be public.
import { readFileSync, readdirSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;
const repo = process.env.GH_RELEASES_REPO || 'andy-zhanggx/andymd';

// One entry per architecture. `key` is the Tauri updater platform key matched
// against the running Mac's arch; `arch` is the artifact-name suffix.
const ARCHES = [
  { triple: 'aarch64-apple-darwin', key: 'darwin-aarch64', arch: 'aarch64', label: 'Apple Silicon' },
  { triple: 'x86_64-apple-darwin',  key: 'darwin-x86_64',  arch: 'x64',     label: 'Intel' },
];

// Locate each arch's signed updater tarball. Tauri names it AndyMD.app.tar.gz
// inside each target's bundle/macos dir; we rename on upload to include the arch.
const builds = [];
for (const a of ARCHES) {
  const dir = join(root, `src-tauri/target/${a.triple}/release/bundle/macos`);
  let tar;
  try { tar = readdirSync(dir).find((f) => /\.app\.tar\.gz$/.test(f)); } catch { /* not built */ }
  if (!tar) { console.warn(`⚠ no ${a.label} updater tarball in ${dir} — skipping`); continue; }
  let signature;
  try { signature = readFileSync(join(dir, `${tar}.sig`), 'utf8').trim(); }
  catch { die(`${a.label} tarball has no ${tar}.sig — build with TAURI_SIGNING_PRIVATE_KEY set`); }
  builds.push({ ...a, dir, tar, signature, assetName: `AndyMD_${version}_${a.arch}.app.tar.gz` });
}
if (!builds.length) die('no signed updater tarballs found — run a signed `pnpm release:macos` first');

// latest.json maps each platform key to ITS OWN arch artifact. Asset URLs are
// deterministic from the tag + filename, so we can bake them in before uploading.
const platforms = {};
for (const b of builds) {
  platforms[b.key] = {
    signature: b.signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${b.assetName}`,
  };
}
const manifest = {
  version,
  notes: extractNotes(version),
  pub_date: process.env.PUB_DATE || new Date().toISOString(),
  platforms,
};
const tmp = mkdtempSync(join(tmpdir(), 'andymd-'));
const manifestPath = join(tmp, 'latest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Copy each tarball + sig to its per-arch asset name in tmp so the two arches'
// identically-named AndyMD.app.tar.gz don't collide as release assets.
const uploads = [manifestPath];
for (const b of builds) {
  const dst = join(tmp, b.assetName);
  copyFileSync(join(b.dir, b.tar), dst);
  copyFileSync(join(b.dir, `${b.tar}.sig`), `${dst}.sig`);
  uploads.push(dst, `${dst}.sig`);
}

const gh = (...args) => execFileSync('gh', args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

// Create the release if absent, then (re)upload all artifacts.
let exists = true;
try { gh('release', 'view', tag, '--repo', repo); } catch { exists = false; }
if (!exists) {
  console.log(`↑ creating release ${tag} on ${repo}`);
  gh('release', 'create', tag, '--repo', repo, '--title', tag, '--notes', manifest.notes || tag);
}
console.log(`↑ uploading ${builds.map((b) => b.assetName).join(', ')} + latest.json → ${repo}@${tag}`);
gh('release', 'upload', tag, ...uploads, '--repo', repo, '--clobber');

console.log(`✓ published per-arch updater artifacts for ${tag} (${Object.keys(platforms).join(', ')})`);
console.log(`  endpoint: https://github.com/${repo}/releases/latest/download/latest.json`);

/** Pull this version's bullet lines out of CHANGELOG.md for the `notes` field. */
function extractNotes(ver) {
  let md;
  try { md = readFileSync(join(root, 'CHANGELOG.md'), 'utf8'); } catch { return ''; }
  const lines = md.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+\\[${ver.replace(/\./g, '\\.')}\\]`).test(l));
  if (start < 0) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\[/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}
