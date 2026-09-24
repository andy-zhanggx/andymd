#!/usr/bin/env node
// Build the Mac App Store flavor and produce a signed, uploadable .pkg.
//
//   pnpm build:mas
//
// This is a different product from the .dmg on GitHub Releases: it is
// sandboxed, has no in-app updater, and uses no private API. See
// docs/mac-app-store.md for the one-time Apple setup and the upload step.
//
// Required environment (all from your Apple Developer account):
//   APPLE_TEAM_ID          10-character Team ID, e.g. AB12CD34EF
//   MAS_PROVISION_PROFILE  path to the downloaded .provisionprofile
// Optional:
//   MAS_APP_CERT           app-signing identity (default: auto-detected)
//   MAS_INSTALLER_CERT     installer-signing identity (default: auto-detected)
import { readFileSync, writeFileSync, existsSync, rmSync, copyFileSync, renameSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcTauri = join(root, 'src-tauri');
const die = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
const capture = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', cwd: root }).trim();

// --- inputs -----------------------------------------------------------------

const teamId = process.env.APPLE_TEAM_ID;
if (!teamId) die('APPLE_TEAM_ID is not set. Find it at https://developer.apple.com/account → Membership.');
if (!/^[A-Z0-9]{10}$/.test(teamId)) die(`APPLE_TEAM_ID "${teamId}" does not look like a 10-character Team ID.`);

const profile = process.env.MAS_PROVISION_PROFILE;
if (!profile) die('MAS_PROVISION_PROFILE is not set. Download the Mac App Store provisioning profile for com.andyz.andymd and point this at the .provisionprofile file.');
if (!existsSync(profile)) die(`MAS_PROVISION_PROFILE does not exist: ${profile}`);

/**
 * Pick a signing identity from the keychain, unless pinned by env.
 *
 * `prefixes` is tried in order and the first one that matches wins, because
 * Apple renamed these certificate types: a modern account gets
 * "Apple Distribution", older ones have "3rd Party Mac Developer Application".
 * Both are valid for Mac App Store signing.
 */
function identity(envVar, prefixes, hint) {
  if (process.env[envVar]) return process.env[envVar];
  const names = capture('security', ['find-identity', '-v'])
    .split('\n')
    .map((l) => l.match(/"([^"]+)"/)?.[1])
    .filter(Boolean);

  for (const prefix of prefixes) {
    const found = names.filter((name) => name.startsWith(prefix));
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      die(`Multiple "${prefix}" certificates found:\n${found.map((f) => `    ${f}`).join('\n')}\n  Pick one with ${envVar}="...".`);
    }
  }
  die(`No signing certificate in your keychain matching ${prefixes.map((p) => `"${p}"`).join(' or ')}.\n  ${hint}\n  Or pin one explicitly with ${envVar}="...".`);
}

const appCert = identity(
  'MAS_APP_CERT',
  ['Apple Distribution', '3rd Party Mac Developer Application'],
  'Create one in Xcode → Settings → Accounts → Manage Certificates → + → Apple Distribution.',
);
const installerCert = identity(
  'MAS_INSTALLER_CERT',
  ['3rd Party Mac Developer Installer', 'Mac Developer Installer'],
  'Create one in Xcode → Settings → Accounts → Manage Certificates → + → Mac Installer Distribution.',
);

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const target = 'universal-apple-darwin';
const appPath = join(srcTauri, 'target', target, 'release/bundle/macos/AndyMD.app');
const outDir = join(root, 'dist-mas');
const pkgPath = join(outDir, `AndyMD-${version}.pkg`);

console.log(`\n▸ AndyMD ${version} → Mac App Store package`);
console.log(`  team       ${teamId}`);
console.log(`  app cert   ${appCert}`);
console.log(`  pkg cert   ${installerCert}`);
console.log(`  profile    ${profile}\n`);

// --- 1. resolve the entitlements template -----------------------------------
// The two identifier entitlements must match the provisioning profile, and the
// Team ID is account-specific, so the checked-in plist carries a placeholder.

const entitlementsOut = join(srcTauri, 'target', 'entitlements.appstore.resolved.plist');
mkdirSync(dirname(entitlementsOut), { recursive: true });
writeFileSync(
  entitlementsOut,
  readFileSync(join(srcTauri, 'entitlements.appstore.plist'), 'utf8').replaceAll('__TEAM_ID__', teamId),
);

// --- 2. build ---------------------------------------------------------------
// `capabilities/self-update.json` names permissions from the updater and process
// plugins. Those plugins are not compiled into this flavor, and Tauri's build
// script validates every file in capabilities/ regardless of which ones the
// config enables — so the file has to be out of the way for the build.

const selfUpdateCap = join(srcTauri, 'capabilities/self-update.json');
const selfUpdateCapParked = `${selfUpdateCap}.parked`;
let parked = false;

try {
  if (existsSync(selfUpdateCap)) {
    renameSync(selfUpdateCap, selfUpdateCapParked);
    parked = true;
  }

  // Everything after `--` goes to cargo: the Tauri CLI has no
  // --no-default-features flag of its own.
  run('pnpm', ['exec', 'tauri', 'build',
    '--target', target,
    '--config', 'src-tauri/tauri.appstore.conf.json',
    '--', '--no-default-features', '--features', 'appstore',
  ], {
    env: {
      ...process.env,
      // Strips the in-app updater UI (see src/featureFlags.ts).
      VITE_APP_STORE: 'true',
      // Release builds must not leak a branch name into the title bar.
      VITE_RELEASE_NAME: process.env.VITE_RELEASE_NAME || `v${version}`,
    },
  });
} finally {
  if (parked) renameSync(selfUpdateCapParked, selfUpdateCap);
}

if (!existsSync(appPath)) die(`Expected a bundle at ${appPath} but it is not there.`);

// --- 3. embed the provisioning profile --------------------------------------
// Must land before signing: codesign seals Contents/, and a Mac App Store build
// without embedded.provisionprofile is rejected at upload.

copyFileSync(profile, join(appPath, 'Contents/embedded.provisionprofile'));

// --- 4. sign ----------------------------------------------------------------
// --force replaces the ad-hoc signature Tauri applies during bundling. The
// bundle has no nested frameworks or helpers, so one pass over it is complete.

run('codesign', [
  '--force',
  '--sign', appCert,
  '--entitlements', entitlementsOut,
  '--timestamp',
  appPath,
]);

run('codesign', ['--verify', '--strict', '--verbose=2', appPath]);

// --- 5. package -------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
run('productbuild', [
  '--component', appPath, '/Applications',
  '--sign', installerCert,
  pkgPath,
]);

console.log(`\n✓ ${pkgPath}`);
console.log(`
Next: validate it first — a full server-side check that costs nothing and
catches most rejections in seconds:

  xcrun altool --validate-app "${pkgPath}" -t macos \\
    -u <your-apple-id> -p "@keychain:AC_UPLOAD"

then upload with: --upload-app -f "${pkgPath}" (that one takes -f; validate does
not). altool ships inside Xcode. Store the app-specific password first with
altool's own command -- a notarytool profile is a different format it cannot
read -- see docs/mac-app-store.md.
`);
