# Android app (Trusted Web Activity)

`apps/android` wraps the deployed PWA in a [Trusted Web
Activity](https://developer.chrome.com/docs/android/trusted-web-activity/) (TWA): a thin native
shell that opens your site full-screen inside Chrome, with no browser UI, once Chrome has verified
the app and the site trust each other. There is no separate native codebase to maintain — the app
always shows whatever you deployed at `APP_URL`.

You need a real, publicly reachable HTTPS deployment first (see [`docs/deploy.md`](./deploy.md)).
The TWA cannot point at `localhost`.

## 1. Prerequisites

Pick one:

- **JDK 17** + the **Android SDK** (either install [Android
  Studio](https://developer.android.com/studio) and let it manage the SDK, or install just the
  [command-line tools](https://developer.android.com/studio#command-tools) and run
  `sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"`). Set `ANDROID_HOME` (or
  create `apps/android/local.properties` with `sdk.dir=/path/to/Android/Sdk`).
- Or install [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
  (`npm i -g @bubblewrap/cli`, itself needs a JDK + Android SDK — it can download both for you with
  `bubblewrap doctor` / on first run) and use `bubblewrap build` instead of Gradle throughout this
  guide; skip straight to [step 4](#4-build-an-unsigned-check-or-a-signed-release).

This repo's `apps/android` project does not commit the Gradle wrapper jar (`gradle-wrapper.jar`,
`gradlew`, `gradlew.bat`) to keep binaries out of git. Generate them once, using any system Gradle
(8.x) install:

```sh
cd apps/android
gradle wrapper --gradle-version 8.10.2
```

This creates `./gradlew` / `./gradlew.bat` matching `gradle/wrapper/gradle-wrapper.properties`. From
here on, use `./gradlew` (it self-downloads the pinned Gradle version on first run) rather than your
system `gradle`.

## 2. Point the app at your deployment

Edit **`apps/android/gradle.properties`** — this is the one place to change:

```properties
twaHost=bank.example.com          # your public hostname, no scheme
twaPackage=family.bank.app        # Android application ID
twaName=Bank of the Family
twaLauncherName=Family Bank
```

Then make the server agree with `twaPackage` — set in `deploy/.env` (or `apps/api/.env` for local
dev):

```
ANDROID_PACKAGE_NAME=family.bank.app
```

`twaHost` must match the host in `APP_URL`. Colors (`twaThemeColor` etc.) already match the PWA
manifest in `apps/web/vite.config.ts`; only change them if you also rebrand the web app.

If you'd rather use Bubblewrap: `twa-manifest.json` in this directory mirrors these same values in
Bubblewrap's schema — run `bubblewrap update` after editing it to regenerate the native project.

## 3. Generate a signing key

Every release build must be signed with the **same key for the life of the app** — Android refuses
to install an update signed with a different key, and Chrome's Digital Asset Links verification is
keyed off this certificate's fingerprint. Generate one once and keep it safe (a password manager or
encrypted backup — losing it means you can never update the app again under the same package name):

```sh
keytool -genkeypair -v \
  -keystore bank-of-the-family-release.keystore \
  -alias family-bank \
  -keyalg RSA -keysize 2048 -validity 10000
```

Keep the keystore **out of the repo** (it already matches `.gitignore`'s `apps/android/*.keystore` /
`*.jks`). Tell Gradle about it via `~/.gradle/gradle.properties` (not this project's
`gradle.properties`, which is committed) so `assembleRelease`/`bundleRelease` can find it:

```properties
# ~/.gradle/gradle.properties — outside the repo, never committed
RELEASE_STORE_FILE=/absolute/path/to/bank-of-the-family-release.keystore
RELEASE_STORE_PASSWORD=your-keystore-password
RELEASE_KEY_ALIAS=family-bank
RELEASE_KEY_PASSWORD=your-key-password
```

The same four values work as environment variables instead (handy for CI):
`RELEASE_STORE_FILE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`. Without
them, `assembleRelease` fails with a clear "signing config not found" error; `assembleDebug` always
works (signed with Android's throwaway debug key, which never passes asset-link verification — see
[Troubleshooting](#troubleshooting)).

## 4. Build an unsigned check, or a signed release

Debug build, to confirm the project compiles (no signing needed):

```sh
cd apps/android
./gradlew assembleDebug
# apk: app/build/outputs/apk/debug/app-debug.apk
```

Signed release **APK** (for sideloading) or **AAB** (for the Play Store):

```sh
./gradlew assembleRelease
# apk: app/build/outputs/apk/release/app-release.apk

./gradlew bundleRelease
# aab: app/build/outputs/bundle/release/app-release.aab
```

With Bubblewrap instead: `bubblewrap build` (prompts for the keystore/passwords, or reads them from
`twa-manifest.json`'s `signingKey`).

## 5. Get the signing fingerprint and wire up assetlinks.json

```sh
keytool -list -v -keystore bank-of-the-family-release.keystore -alias family-bank
```

Copy the **SHA256** fingerprint line, e.g.:

```
Certificate fingerprints:
	 SHA256: 14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A9:B4:...
```

Put it (colons and all, comma-separate for more than one — e.g. you also have a Play App Signing key,
see below) into `deploy/.env`:

```
APP_ASSETLINKS_FINGERPRINTS=14:6D:E9:...
ANDROID_PACKAGE_NAME=family.bank.app
```

Redeploy the server (`docker compose -f deploy/docker-compose.yml up -d --build`, see
[`docs/deploy.md`](./deploy.md)) so it serves the updated
`GET https://bank.example.com/.well-known/assetlinks.json`. Check it:

```sh
curl -s https://bank.example.com/.well-known/assetlinks.json | jq .
```

You should see your package name and fingerprint in a `delegate_permission/common.handle_all_urls`
statement. Google also has a validator:
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://bank.example.com&relation=delegate_permission/common.handle_all_urls`.

## 6. Install it

**Via adb** (device with USB debugging enabled, or an emulator):

```sh
adb install app/build/outputs/apk/release/app-release.apk
# or, over the same network instead of USB:
adb connect <phone-ip>:5555 && adb install app-release.apk
```

**Sideloading without adb**: copy the APK to the phone (email, cloud drive, USB file transfer) and
open it there; Android will prompt to allow installing from that source once.

## 7. Troubleshooting

- **Address bar visible at the top of the app** — Digital Asset Links didn't verify. Causes, most
  common first:
  - You installed a **debug** build. Its signing fingerprint is Android's per-machine debug key, not
    the one in `APP_ASSETLINKS_FINGERPRINTS`. Install a release build signed with your real key.
  - `APP_ASSETLINKS_FINGERPRINTS` / `ANDROID_PACKAGE_NAME` don't match this build, or the server
    hasn't been redeployed since you changed them. Re-check with the `curl` above.
  - `twaHost` in `gradle.properties` doesn't match `APP_URL`'s host, or the intent-filter's host in
    the built manifest is stale — rebuild after changing `gradle.properties`.
  - No network / DNS at verification time, or the assetlinks response isn't valid JSON / isn't served
    with a JSON content type.
- **Chrome caches verification results.** After fixing `assetlinks.json`, uninstall and reinstall the
  app (or `adb shell am force-stop com.google.android.gms` then relaunch) rather than assuming an
  immediate retry — Chrome/Play Services re-check periodically, not on every launch.
- **Publishing to the Play Store**: Play App Signing re-signs your upload with its own key, so the
  fingerprint that ends up in the installed app is **not** the one from your local keystore. After
  the first upload, copy the "SHA-256 certificate fingerprint" from Play Console → **Setup → App
  signing**, and add it to `APP_ASSETLINKS_FINGERPRINTS` alongside (or instead of, once you're always
  installing from the Store) your upload key's fingerprint.
- **Web Push notifications**: the TWA runs the site inside real Chrome, so the same VAPID Web Push
  wired up per [`docs/deploy.md`](./deploy.md) works with no extra Android-specific setup (no
  Firebase project needed). The `POST_NOTIFICATIONS` permission in the manifest is what lets Chrome
  actually show them on Android 13+; the user is prompted the first time the site calls
  `Notification.requestPermission()`, same as on desktop.
- **Gradle can't find the Android SDK**: create `apps/android/local.properties` with
  `sdk.dir=/absolute/path/to/Android/Sdk`, or set `ANDROID_HOME`/`ANDROID_SDK_ROOT`.
- **"Keystore was tampered with, or password was incorrect"**: the store or key password in
  `~/.gradle/gradle.properties`/env vars doesn't match what you typed into `keytool -genkeypair`.

## See also

- [`docs/deploy.md`](./deploy.md) — get `bank.example.com` actually serving the app first.
- [`docs/authentik-setup.md`](./authentik-setup.md) — parent sign-in works the same inside the TWA as
  in a normal browser tab (it's still Chrome under the hood).
- `.github/workflows/android.yml` — builds `assembleDebug` in CI on every change under
  `apps/android/**`, as a compile check (it does not sign or publish anything).
