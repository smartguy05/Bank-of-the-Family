# Bank of the Family — Android TWA proguard rules
#
# The app is almost entirely androidbrowserhelper (a thin TWA/Custom Tabs shell around Chrome) with
# no custom application code, so there is very little of ours to keep. These rules just make sure
# R8/ProGuard don't strip anything the library or the manifest reflectively references.

# android-browser-helper's LauncherActivity, DelegationService, FileProvider etc. are referenced by
# fully-qualified class name from AndroidManifest.xml — keep them and their public API.
-keep class com.google.androidbrowserhelper.** { *; }
-keep class androidx.browser.** { *; }

# androidx.core.content.FileProvider is referenced from the manifest <provider>.
-keep class androidx.core.content.FileProvider { *; }

# Keep Trusted Web Activity / Custom Tabs AIDL-generated classes intact.
-keep class android.support.customtabs.** { *; }

-dontwarn com.google.androidbrowserhelper.**
