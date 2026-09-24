# Shipping AndyMD on the Mac App Store

AndyMD ships through two independent channels:

| | GitHub Releases (`.dmg`) | Mac App Store (`.pkg`) |
|---|---|---|
| Build | `pnpm release:macos` | `pnpm build:mas` |
| Cargo features | `self-update` (default) | `appstore`, no defaults |
| Sandboxed | no | **yes** (mandatory) |
| In-app updater | yes | no — the App Store updates it |
| pandoc export (docx/epub/latex/rtf) | yes | no — needs a subprocess |
| Distribution | free download, you sign the tag | free on the store, Apple reviews it |

The DMG channel is unchanged. Everything below is about the store build.

## What the sandbox changed

The App Sandbox is not optional on the Mac App Store, and AndyMD is a vault
editor over arbitrary user folders — the two are in tension. Four things had to
change:

1. **Folder access survives relaunch via security-scoped bookmarks.**
   Under the sandbox, picking a folder grants access only to the process that
   asked. A path in `config.json` is worthless next launch. Every picked
   folder/file now gets a bookmark blob ([`bookmarks.rs`](../src-tauri/src/bookmarks.rs));
   `setup()` resolves them all before the frontend restores `lastWorkspace`.
   The same code runs in the DMG build, so the path is exercised daily.
2. **Trash goes through NSFileManager, not Finder.** `trash` defaults to driving
   Finder over AppleScript, which the sandbox blocks. `delete_to_trash` now pins
   `DeleteMethod::NsFileManager`.
3. **Reveal in Finder goes through NSWorkspace.** `open -R` is a subprocess.
4. **pandoc export is gone from this flavor.** It shells out, and pandoc is GPL
   so it cannot be bundled. The menu entries are absent rather than broken.
   Export to HTML is ours and stays.

Also dropped for review reasons: the in-app updater (guidelines 2.4.5 / 3.2.2)
and `macOSPrivateApi`. Nothing used the private API — the window is a plain
decorated window with an overlay title bar — so it is now off in **both**
flavors.

## One-time Apple setup

You need a paid Apple Developer Program membership (you have one). None of this
can be scripted; it is all account work.

1. **Register the bundle ID.** [developer.apple.com](https://developer.apple.com/account) →
   Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App.
   Bundle ID: `com.andyz.andymd` (explicit, not wildcard). No capabilities need
   ticking — App Sandbox is an entitlement, not a capability.
2. **Create the two certificates.** Easiest in Xcode → Settings → Accounts →
   your Apple ID → Manage Certificates → **+**:
   - **Apple Distribution** → gives `Apple Distribution: …`. This is the modern
     unified certificate; older accounts may instead have
     `3rd Party Mac Developer Application: …`, which works the same.
     `build-mas.mjs` accepts either.
   - **Mac Installer Distribution** → gives `3rd Party Mac Developer Installer: …`
3. **Create the provisioning profile.** Profiles → **+** → under *Distribution*
   pick the macOS App Store type (the portal currently calls it **Mac App Store
   Connect**) → App ID `com.andyz.andymd` → your distribution certificate.
   Download it; note where you put the `.provisionprofile`.

   Two traps: the file must end in **`.provisionprofile`**, not
   `.mobileprovision` — the latter is iOS and will be rejected. And Xcode's
   auto-managed profiles in
   `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` are *development*
   profiles for a wildcard App ID; they cannot be used here.
4. **Create the app record** in [App Store Connect](https://appstoreconnect.apple.com)
   → Apps → **+** → New App. Platform macOS, bundle ID `com.andyz.andymd`,
   SKU anything (e.g. `andymd`), primary language English.
5. **Note your Team ID** — Membership page, 10 characters.

## Build and upload

```bash
export APPLE_TEAM_ID=XXXXXXXXXX
export MAS_PROVISION_PROFILE=~/Downloads/AndyMD_Mac_App_Store.provisionprofile
pnpm build:mas
```

That produces `dist-mas/AndyMD-<version>.pkg`: a universal (arm64 + x86_64)
sandboxed build, signed with your distribution certificate, with the
provisioning profile embedded, wrapped by `productbuild`.

Upload it with **Transporter.app** (free on the Mac App Store — drag the `.pkg`
in), or:

```bash
xcrun altool --upload-app -f dist-mas/AndyMD-<version>.pkg -t macos -u <apple-id> -p <app-specific-password>
```

Use an [app-specific password](https://appleid.apple.com), never your real one.

The build appears in App Store Connect after processing (10–60 min), then you
attach it to a version and submit.

## App Store Connect checklist

- **Price: Free.** Pricing and Availability → Price Schedule → Free. You do not
  need a paid-apps agreement for a free app — only the free-apps agreement,
  which you accept once under Business → Agreements.
- **Screenshots.** macOS requires at least one, at 1280×800, 1440×900, 2560×1600
  or 2880×1800. Take them from the running app (⇧⌘4 then Space, on a window
  sized to 1280×800) — editing a real vault, showing the file tree, an outline
  and rendered math reads far better than an empty document.
- **Description, keywords, support URL, marketing URL.** Support URL is required
  and must resolve — the GitHub repo's issues page is fine.
- **Privacy policy URL** is required for every app, even one that collects
  nothing. A short page saying AndyMD stores everything locally and transmits
  nothing is enough.
- **App Privacy** questionnaire → "Data Not Collected". This must agree with
  [`PrivacyInfo.xcprivacy`](../src-tauri/PrivacyInfo.xcprivacy), which declares
  the two required-reason APIs the app touches (file timestamps, UserDefaults)
  and no collected data.
- **Category** is already `public.app-category.productivity` in the bundle.
- **Export compliance** is pre-answered by `ITSAppUsesNonExemptEncryption=false`
  in [`Info.plist`](../src-tauri/Info.plist).
- **Age rating** → 4+.

## Before you submit: the manual check

One behavior cannot be verified from a script, because it needs a real click in
the open panel. Do this once on the signed build:

1. Install the `.pkg` (or run the `.app` from the build output).
2. Open a vault folder. Edit a file, save it. Delete a file to Trash. Reveal a
   file in Finder.
3. **Quit and relaunch.** The vault must reopen by itself, with a working file
   tree — that is the bookmark path doing its job. If it reopens empty or throws
   permission errors, the bookmark did not resolve and the build is not shippable.
4. Confirm there is no "Software Update…" in the Help menu and no "Export to"
   submenu under File.

## Known review risks

- **Guideline 2.4.5(i) — sandbox.** Covered: the app declares only
  user-selected read/write plus app-scope bookmarks, no temporary exceptions.
- **Guideline 2.4.5(iv) — self-update.** Covered: no updater in this binary.
  Verified by `strings`: the release endpoint and minisign key are absent.
- **Guideline 2.5.1 — private API.** Covered: `macOSPrivateApi` is off.
- **Guideline 4.2 — minimum functionality.** A Markdown editor with a vault
  browser, outline, search, backlinks and version history is well clear of the
  bar, but the screenshots are what the reviewer judges it by. Show the app
  doing real work.
- **Guideline 5.1.1 — privacy.** The app asks for nothing beyond a folder the
  user picks, and the privacy manifest matches the questionnaire.

## Keeping the two channels in sync

Both flavors build from the same source and the same `version` in
`package.json`. A release that goes to both is: cut the version as usual
(see CLAUDE.md → Releases), push the tag for the DMG, then run `pnpm build:mas`
from that same commit and upload. The App Store version number must increase on
every upload, so never upload twice from the same version.
