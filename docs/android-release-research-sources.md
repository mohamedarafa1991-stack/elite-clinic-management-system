# Android Release Research Sources

## Android Gradle Plugin 8.12 compatibility

The official Android Developers release notes for Android Gradle Plugin 8.12.0 state that AGP 8.12 supports API level 36, requires Gradle 8.13 as its minimum/default version, requires SDK Build Tools 35.0.0, and requires JDK 17. Source: [Android Gradle Plugin 8.12.0 release notes](https://developer.android.com/build/releases/agp-8-12-0-release-notes).

## Android command-line tooling

The official Android Developers command-line tools page states that the Android SDK is composed of installable packages managed by Android Studio’s SDK Manager or the `sdkmanager` command-line tool. It documents the `cmdline-tools`, Build Tools, Platform Tools, `adb`, `apksigner`, and related package locations. Source: [Android command-line tools](https://developer.android.com/tools).

## Project toolchain decision

The Android project therefore pins a Gradle 8.13 wrapper, uses JDK 17 for the Kotlin toolchain, targets/compiles API 36, and requests Build Tools 35.0.0. The wrapper distribution was downloaded from `https://services.gradle.org/distributions/gradle-8.13-bin.zip` and its official SHA-256 sidecar was checked before generating the wrapper. The sandbox SDK was provisioned from Google’s command-line tools package and is not a repository artifact.
