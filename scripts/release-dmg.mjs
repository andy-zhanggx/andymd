#!/usr/bin/env node
// Attach the locally-built macOS .dmg to this version's GitLab Release.
//
// AndyMD's .dmg can't be built in CI (no macOS runner), so releases ship the
// installer from a local build:
//   pnpm version:set <x.y.z>   # then commit + tag + push  (CI tests + creates the release)
//   pnpm tauri build           # → src-tauri/target/release/bundle/dmg/AndyMD_<ver>_<arch>.dmg
//   pnpm release:dmg           # this script: upload the .dmg + attach it to the release
//
// Needs a GitLab token in $GITLAB_TOKEN (falls back to the token embedded in
// the `origin` remote). Project + host are derived from the `origin` remote.
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;

// Resolve the GitLab host + URL-encoded project path from `origin`.
const origin = execSync('git config --get remote.origin.url', { cwd: root }).toString().trim();
const m = origin.match(/^https?:\/\/(?:[^@]*@)?([^/]+)\/(.+?)(?:\.git)?$/);
if (!m) die(`could not parse a GitLab https URL from origin: ${origin}`);
const [, host, projectPath] = m;
const api = `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}`;

const token = process.env.GITLAB_TOKEN || (origin.match(/\/\/[^:]*:([^@]+)@/) || [])[1];
if (!token) die('no GitLab token — set $GITLAB_TOKEN (e.g. source ~/.zshrc)');
const auth = { 'PRIVATE-TOKEN': token };

// Find the built .dmg for this version (arch suffix varies: aarch64 / x64).
const dmgDir = join(root, 'src-tauri/target/release/bundle/dmg');
let file;
try {
  file = readdirSync(dmgDir).find((f) => new RegExp(`^AndyMD_${version.replace(/\./g, '\\.')}_.*\\.dmg$`).test(f));
} catch {
  die(`no bundle dir at ${dmgDir} — run \`pnpm tauri build\` first`);
}
if (!file) die(`no AndyMD_${version}_*.dmg in ${dmgDir} — run \`pnpm tauri build\` (is package.json at ${version}?)`);

const pkgUrl = `${api}/packages/generic/andymd/${tag}/${file}`;

async function gl(method, url, opts = {}) {
  const res = await fetch(url, { method, headers: { ...auth, ...(opts.headers || {}) }, body: opts.body });
  if (!res.ok) die(`${method} ${url.replace(/\/\/[^/]+/, '//…')} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// 0. The release must already exist (CI creates it on the tag push).
await gl('GET', `${api}/releases/${tag}`).catch(() => die(`release ${tag} not found — push the ${tag} tag first (CI creates the release)`));

// 1. Upload the .dmg to the Generic Package Registry.
console.log(`↑ uploading ${file} → packages/generic/andymd/${tag}/`);
await gl('PUT', pkgUrl, { body: readFileSync(join(dmgDir, file)) });

// 2. Replace any existing .dmg / web-zip asset links, then add the .dmg link.
const links = await gl('GET', `${api}/releases/${tag}/assets/links`);
for (const l of links) {
  if (l.name.includes(file) || l.name.includes('web.zip')) {
    await gl('DELETE', `${api}/releases/${tag}/assets/links/${l.id}`);
    console.log(`  removed stale asset link: ${l.name}`);
  }
}
const body = new URLSearchParams({
  name: `${file} (macOS, Apple Silicon)`,
  url: pkgUrl,
  link_type: 'package',
  direct_asset_path: `/${file}`,
}).toString();
const link = await gl('POST', `${api}/releases/${tag}/assets/links`, {
  body,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

console.log(`✓ attached ${file} to ${tag}`);
console.log(`  download: https://${host}/${projectPath}/-/releases/${tag}/downloads/${file}`);
console.log(`  (link id ${link.id})`);
