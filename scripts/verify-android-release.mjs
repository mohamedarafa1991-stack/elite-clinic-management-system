import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const androidRoot = join(repositoryRoot, "apps/android");
const appRoot = join(androidRoot, "app");
const verifyArtifacts = process.argv.includes("--artifacts");
let failures = 0;

function pass(message) {
  console.log(`ANDROID_RELEASE_PASS: ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`ANDROID_RELEASE_FAIL: ${message}`);
}

function source(relativePath) {
  const path = join(repositoryRoot, relativePath);
  if (!existsSync(path)) {
    fail(`required source is missing: ${relativePath}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function requireText(relativePath, text, description) {
  const content = source(relativePath);
  if (content.includes(text)) pass(description);
  else
    fail(
      `${description} (${relativePath} does not contain ${JSON.stringify(text)})`,
    );
}

function requireRegex(relativePath, pattern, description) {
  const content = source(relativePath);
  if (pattern.test(content)) pass(description);
  else fail(`${description} (${relativePath} does not match ${pattern})`);
}

const wrapperProperties = source(
  "apps/android/gradle/wrapper/gradle-wrapper.properties",
);
if (wrapperProperties.includes("gradle-8.13-bin.zip")) {
  pass("Gradle wrapper is pinned to 8.13 binary distribution");
} else {
  fail("Gradle wrapper must be pinned to gradle-8.13-bin.zip");
}

requireText(
  "apps/android/build.gradle.kts",
  'id("com.android.application") version "8.12.2" apply false',
  "Android Gradle Plugin is pinned to 8.12.2",
);
requireText(
  "apps/android/build.gradle.kts",
  'id("org.jetbrains.kotlin.android") version "2.2.20" apply false',
  "Kotlin Android plugin is pinned to 2.2.20",
);
requireText(
  "apps/android/build.gradle.kts",
  'id("com.google.devtools.ksp") version "2.2.20-2.0.4" apply false',
  "KSP plugin is pinned to a published Kotlin 2.2.20-compatible release",
);
requireText(
  "apps/android/app/build.gradle.kts",
  "compileSdk = 36",
  "compile SDK is API 36",
);
requireText(
  "apps/android/app/build.gradle.kts",
  "targetSdk = 36",
  "target SDK is API 36",
);
requireText(
  "apps/android/app/build.gradle.kts",
  "minSdk = 29",
  "minimum supported Android API is 29",
);
requireText(
  "apps/android/app/build.gradle.kts",
  "jvmToolchain(17)",
  "Kotlin JVM toolchain is JDK 17",
);
requireText(
  "apps/android/app/build.gradle.kts",
  'testImplementation("org.json:json:20250517")',
  "JVM unit tests use a pinned real org.json implementation",
);

const manifest = source("apps/android/app/src/main/AndroidManifest.xml");
if (
  manifest.includes('android:allowBackup="false"') &&
  manifest.includes('android:fullBackupContent="false"')
) {
  pass("Android backup is disabled for protected local data");
} else {
  fail("Android manifest must disable backup for protected local data");
}
if (manifest.includes('android:usesCleartextTraffic="false"')) {
  pass("Android cleartext traffic is disabled");
} else {
  fail("Android manifest must disable cleartext traffic");
}
requireText(
  "apps/android/app/src/main/AndroidManifest.xml",
  'android:dataExtractionRules="@xml/data_extraction_rules"',
  "Android 12+ data-extraction rules are explicitly configured",
);
requireText(
  "apps/android/app/src/main/AndroidManifest.xml",
  'android:icon="@drawable/ic_launcher_foreground"',
  "Android application icon is explicitly configured",
);
requireText(
  "apps/android/app/src/main/res/xml/data_extraction_rules.xml",
  "<device-transfer>",
  "device-transfer backup exclusions are present",
);

const database = source(
  "apps/android/app/src/main/java/com/elite/clinic/data/EliteDatabase.kt",
);
if (database.includes("version = 6")) pass("Room database schema version is 6");
else fail("Room database schema version must be 6");
for (const migration of [
  "MIGRATION_1_2",
  "MIGRATION_2_3",
  "MIGRATION_3_4",
  "MIGRATION_4_5",
  "MIGRATION_5_6",
]) {
  if (database.includes(migration)) pass(`Room ${migration} is present`);
  else fail(`Room ${migration} is missing`);
}
requireText(
  "apps/android/app/src/main/java/com/elite/clinic/data/EliteDatabase.kt",
  "fallbackToDestructiveMigrationOnDowngrade(false)",
  "Room downgrade destructive migration is disabled",
);
requireText(
  "apps/android/app/src/main/java/com/elite/clinic/data/EliteDatabase.kt",
  ".openHelperFactory(encryptedFactory)",
  "Room requires the encrypted SQLCipher-compatible factory",
);

const requestFactory = source(
  "apps/android/app/src/main/java/com/elite/clinic/sync/LanSyncRequestFactory.kt",
);
for (const scope of [
  "appointments",
  "patient-summary",
  "encounter-summary",
  "clinical-notes",
  "export-governance",
  "billing-summary",
]) {
  if (requestFactory.includes(`"${scope}"`))
    pass(`sync scope is present: ${scope}`);
  else fail(`sync scope is missing: ${scope}`);
}

const documentScreen = source(
  "apps/android/app/src/main/java/com/elite/clinic/DoctorDocumentScreen.kt",
);
if (
  documentScreen.includes("FLAG_SECURE") &&
  documentScreen.includes("window.addFlags(FLAG_SECURE)")
) {
  pass("doctor document workspace applies FLAG_SECURE");
} else {
  fail("doctor document workspace must apply FLAG_SECURE");
}
if (
  documentScreen.includes("ZeroizableBytes") &&
  documentScreen.includes("useViewerCopy")
) {
  pass("doctor documents use zeroizable ownership and scoped viewer copies");
} else {
  fail("doctor documents must use ZeroizableBytes and useViewerCopy");
}
if (
  documentScreen.includes("context.cacheDir") &&
  documentScreen.includes("temporaryFile.delete()")
) {
  pass(
    "PDF preview uses an ephemeral cache file and deletes it after rendering",
  );
} else {
  fail("PDF preview must delete its ephemeral rendering file");
}
for (const forbidden of ["getExternalFilesDir", "openFileOutput", "filesDir"]) {
  if (!documentScreen.includes(forbidden))
    pass(
      `doctor document workspace does not use persistent file API: ${forbidden}`,
    );
  else
    fail(
      `doctor document workspace must not use persistent file API: ${forbidden}`,
    );
}

requireText(
  "apps/android/app/src/main/java/com/elite/clinic/sync/SyncWorker.kt",
  "enqueueUniquePeriodicWork",
  "sync WorkManager periodic work is configured",
);
requireText(
  "apps/android/app/src/main/java/com/elite/clinic/sync/SecureSyncCoordinator.kt",
  "SyncFailureClassifier.from",
  "sync failures use typed classification",
);

if (verifyArtifacts) {
  const releaseDirectory = join(appRoot, "build/outputs/apk/release");
  if (!existsSync(releaseDirectory)) {
    fail("release APK output directory is missing; run assembleRelease first");
  } else {
    const apks = readdirSync(releaseDirectory)
      .filter((name) => name.endsWith(".apk"))
      .map((name) => join(releaseDirectory, name));
    if (apks.length === 0) {
      fail("no release APK was produced");
    } else {
      for (const apk of apks) {
        const listing = execFileSync("unzip", ["-l", apk], {
          encoding: "utf8",
        });
        if (
          listing.includes("classes.dex") &&
          listing.includes("AndroidManifest.xml")
        ) {
          pass(`release APK has a valid archive structure: ${apk}`);
        } else {
          fail(
            `release APK is missing classes.dex or AndroidManifest.xml: ${apk}`,
          );
        }
        if (statSync(apk).size > 0) pass(`release APK is non-empty: ${apk}`);
        else fail(`release APK is empty: ${apk}`);
      }
    }
  }
}

if (failures > 0) {
  console.error(`ANDROID_RELEASE_SUMMARY: ${failures} check(s) failed`);
  process.exit(1);
}
console.log(
  "ANDROID_RELEASE_SUMMARY: all static Android release checks passed",
);
