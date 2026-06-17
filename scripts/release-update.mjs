#!/usr/bin/env node
// Upload the locally-built, signed updater artifacts to GitLab and publish the
// `latest.json` manifest the in-app updater reads.
//
//   pnpm version:set <x.y.z>   # commit + tag + push (CI creates the release)
//   TAURI_SIGNING_PRIVATE_KEY="$(cat andymd-updater.key)" \
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
//     pnpm tauri build         # → bundle/macos/*.app.tar.gz + .sig
//   pnpm release:update        # this script
//
// Needs $GITLAB_TOKEN (or the token embedded in `origin`).
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;

const origin = execSync('git config --get remote.origin.url', { cwd: root }).toString().trim();
const m = origin.match(/^https?:\/\/(?:[^@]*@)?([^/]+)\/(.+?)(?:\.git)?$/);
if (!m) die(`could not parse a GitLab https URL from origin: ${origin}`);
const [, host, projectPath] = m;
const projectId = '134118';
const api = `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}`;
const idApi = `https://${host}/api/v4/projects/${projectId}`;

const token = process.env.GITLAB_TOKEN || (origin.match(/\/\/[^:]*:([^@]+)@/) || [])[1];
if (!token) die('no GitLab token — set $GITLAB_TOKEN');
const auth = { 'PRIVATE-TOKEN': token };

async function gl(method, url, opts = {}) {
  const res = await fetch(url, { method, headers: { ...auth, ...(opts.headers || {}) }, body: opts.body });
  if (!res.ok && res.status !== 404) die(`${method} ${url.replace(/\/\/[^/]+/, '//…')} → ${res.status} ${await res.text()}`);
  return res.status === 204 || res.status === 404 ? null : res.json().catch(() => null);
}

// Locate the signed updater tarball + signature.
const macDir = join(root, 'src-tauri/target/release/bundle/macos');
let tar;
try {
  tar = readdirSync(macDir).find((f) => /\.app\.tar\.gz$/.test(f));
} catch { die(`no bundle dir at ${macDir} — run a signed \`pnpm tauri build\` first`); }
if (!tar) die(`no *.app.tar.gz in ${macDir} — ensure createUpdaterArtifacts + signing env are set`);
const sig = `${tar}.sig`;
const signature = readFileSync(join(macDir, sig), 'utf8').trim();

const tarName = `AndyMD_${version}_aarch64.app.tar.gz`;
const tarUrl = `${api}/packages/generic/andymd/${tag}/${tarName}`;
const latestUrl = `${api}/packages/generic/andymd/latest/latest.json`;
// The URL the app downloads is the numeric-id form (stable across renames).
const downloadUrl = `${idApi}/packages/generic/andymd/${tag}/${tarName}`;

// 1. Upload the tarball.
console.log(`↑ ${tarName} → packages/generic/andymd/${tag}/`);
await gl('PUT', tarUrl, { body: readFileSync(join(macDir, tar)) });

// 2. Build + upload latest.json (overwrite the stable `latest` package).
const notes = extractNotes(version);
const manifest = {
  version,
  notes,
  pub_date: process.env.PUB_DATE || new Date().toISOString(),
  platforms: { 'darwin-aarch64': { signature, url: downloadUrl } },
};
console.log(`↑ latest.json (v${version}) → packages/generic/andymd/latest/`);
await gl('PUT', latestUrl, {
  body: JSON.stringify(manifest, null, 2),
  headers: { 'Content-Type': 'application/json' },
});

console.log(`✓ published updater manifest for ${tag}`);
console.log(`  endpoint: ${latestUrl.replace(api, idApi)}`);

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
