# Local Android build toolchain

Run `/home/julia/workspace/pocket-stars/tools/build-apk.sh` from any working directory. No Gradle, AndroidX, network access, system installation, or global Java configuration is required to build.

Inputs (not modified by toolchain setup):
- `../android/AndroidManifest.xml`
- all Java files beneath `../android/src/` (including `app/pocketstars/MainActivity.java`)
- optional `../android/res/`
- `../web/` copied into APK `assets/` without filtering

Output: `../dist/pocket-stars.apk`. Uses Java 8 language/bytecode, compile SDK 34, min SDK 26, target SDK 34. Min and target SDK are explicitly passed to aapt2. No core-library desugaring dependencies: avoid Java APIs absent on Android API 26.

**Device compatibility:** standard LineageOS 14.1 corresponds to Android 7.1/API 25. The requested minSdk 26 build cannot install on API 25. Check actual tablet API using `adb -s HGT7CR29 shell getprop ro.build.version.sdk` before deployment; obtain approval to change minSdk or OS if necessary. No test APK was deployed.

Tools:
- `jdk/`: Eclipse Temurin OpenJDK 17.0.21+9 (Linux x86_64)
- `android-sdk/platforms/android-34/android.jar`: Android platform 34
- `android-sdk/build-tools/34.0.0/`: aapt2, d8, apksigner, zipalign
- `signing/pocket-stars.jks`: private local development signing identity; keep this file for upgrade continuity. Directory mode 700, key mode 600. Standard development password is not a parent PIN.

Standalone tool invocation requires both `JAVA_HOME=$PWD/tools/jdk` and `$JAVA_HOME/bin` prepended to PATH (the upstream d8/apksigner wrappers execute `java` from PATH). The build script sets both itself. It creates unique temporary build directories beneath `/home/julia/.hermes/workspace/pocket-stars/apk-build`, and cleans them on exit.

Test overrides: PS_ANDROID_DIR, PS_WEB_DIR, PS_APK_OUT, PS_BUILD_DIR. All should be absolute paths. Isolated harmless WebView test sources and signed APK live only beneath `/home/julia/.hermes/workspace/pocket-stars/toolchain-test/`. Verified SDK 26/34 badging, v2/v3 signatures, zip alignment, ZIP integrity, DEX header, and embedded HTML assets. Main application has not been compiled by toolchain setup.

Download provenance (archives retained in matching agent-only scratch topic):
- https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse
  SHA256 8b9b611d917e3dfd8419d3566b5949226f69b052fed7e109c1368add1dfe8711
- https://dl.google.com/android/repository/build-tools_r34-linux.zip
  SHA256 e858c4b60069d0431051b225d384413b1643e1289b00a4825aed347f25bd510f
- https://dl.google.com/android/repository/platform-34-ext7_r03.zip
  SHA256 16fdb74c55e59ae3ef52def135aec713508467bd56d7dabcd8c9be31fa8b20f3

Checksums above record actual downloads (not independent publisher checksum verification). JDK tar extraction preserved executable modes; Android executable modes were explicitly set. No system packages were installed.
