# Bank of the Family — Android (Trusted Web Activity)

A thin native wrapper around the PWA at `apps/web`, using a
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/) via
[`androidbrowserhelper`](https://github.com/GoogleChromeLabs/android-browser-helper). There is no
custom app code — `AndroidManifest.xml` points the library's `LauncherActivity` at your deployed
site. Full build/signing/install walkthrough: [`docs/android-build.md`](../../docs/android-build.md).

This project was written by hand to be equivalent to what
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) generates, because Bubblewrap's
interactive `init` couldn't run in this environment. `twa-manifest.json` is included in Bubblewrap's
own format — if you have Bubblewrap installed, `bubblewrap update` / `bubblewrap build` in this
directory works as an alternative to Gradle.

## Configure (one place)

Edit **`gradle.properties`**:

| Property         | Meaning                                                          |
| ---------------- | ----------------------------------------------------------------- |
| `twaHost`        | Your deployed hostname, no scheme (matches `APP_URL`)             |
| `twaPackage`     | Android application ID (matches `ANDROID_PACKAGE_NAME`)           |
| `twaName`        | App name shown under the icon / in app switcher                   |
| `twaLauncherName`| Short label for the launcher activity                             |

Everything else (the intent-filter host, `applicationId`, the asset-links statement this app makes
about your site) is generated from those via `manifestPlaceholders`/`resValue` in `app/build.gradle`
— see the comments there. If you also change `twaHost`/`twaPackage`, update the matching
`APP_URL`/`ANDROID_PACKAGE_NAME` in `deploy/.env` (or `apps/api/.env`) so the server's
`/.well-known/assetlinks.json` names the same package.

## Layout

```
apps/android/
├── build.gradle, settings.gradle, gradle.properties   # root Gradle project
├── gradle/wrapper/gradle-wrapper.properties           # wrapper version pin (jar not committed)
├── twa-manifest.json                                  # Bubblewrap-compatible project description
├── store/play-store-icon-512.png                      # 512×512 icon for a Play Store listing
└── app/
    ├── build.gradle                                   # app module: signing, TWA config wiring
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml                        # LauncherActivity + TWA plumbing
        └── res/
            ├── values/{colors,strings,styles}.xml
            ├── mipmap-{m,h,x,xx,xxx}hdpi/              # legacy + adaptive-icon foreground PNGs
            ├── mipmap-anydpi-v26/                      # adaptive icon XML (API 26+)
            ├── drawable/splash.png                     # splash screen mark
            └── xml/filepaths.xml                       # FileProvider paths
```

No Android SDK is available in the environment this project was authored in, so it has not been
compiled here — see `docs/android-build.md` for how to build it and what to check.
