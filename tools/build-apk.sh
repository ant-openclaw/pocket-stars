#!/usr/bin/env bash
# Dependency-free native Android/WebView build. All inputs may be overridden for isolated tests.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export JAVA_HOME="$ROOT/tools/jdk"
export PATH="$JAVA_HOME/bin:$PATH"
BT="$ROOT/tools/android-sdk/build-tools/34.0.0"
ANDROID_JAR="$ROOT/tools/android-sdk/platforms/android-34/android.jar"
ANDROID_DIR="${PS_ANDROID_DIR:-$ROOT/android}"
WEB_DIR="${PS_WEB_DIR:-$ROOT/web}"
OUT="${PS_APK_OUT:-$ROOT/dist/pocket-stars.apk}"
WORK="${PS_BUILD_DIR:-/home/julia/.hermes/workspace/pocket-stars/apk-build}"
KEY_DIR="$ROOT/tools/signing"
[[ -f "$ANDROID_DIR/AndroidManifest.xml" ]] || { printf 'Missing manifest: %s\n' "$ANDROID_DIR/AndroidManifest.xml" >&2; exit 1; }
[[ -d "$ANDROID_DIR/src" && -d "$WEB_DIR" ]] || { printf 'Missing source or web directory\n' >&2; exit 1; }
# Never delete a caller-supplied directory: use a unique disposable child.
mkdir -p "$WORK" "$(dirname -- "$OUT")"
BUILD="$(mktemp -d "$WORK/run.XXXXXXXX")"
trap 'rm -rf -- "$BUILD"' EXIT
mkdir -p "$BUILD/classes" "$BUILD/generated" "$BUILD/dex"
LINK=(link -o "$BUILD/resources.apk" -I "$ANDROID_JAR" --manifest "$ANDROID_DIR/AndroidManifest.xml" --min-sdk-version 26 --target-sdk-version 34 --auto-add-overlay --java "$BUILD/generated" -A "$WEB_DIR")
if [[ -d "$ANDROID_DIR/res" ]] && [[ -n "$(find "$ANDROID_DIR/res" -type f -print -quit)" ]]; then
  "$BT/aapt2" compile --dir "$ANDROID_DIR/res" -o "$BUILD/resources.zip"
  LINK+=("$BUILD/resources.zip")
fi
"$BT/aapt2" "${LINK[@]}"
mapfile -d '' SOURCES < <(find "$ANDROID_DIR/src" "$BUILD/generated" -name '*.java' -type f -print0)
[[ ${#SOURCES[@]} -gt 0 ]] || { printf 'No Java sources\n' >&2; exit 1; }
javac --release 8 -encoding UTF-8 -classpath "$ANDROID_JAR" -d "$BUILD/classes" "${SOURCES[@]}"
jar cf "$BUILD/classes.jar" -C "$BUILD/classes" .
"$BT/d8" --release --min-api 26 --lib "$ANDROID_JAR" --output "$BUILD/dex" "$BUILD/classes.jar"
python3 - "$BUILD/resources.apk" "$BUILD/dex" <<'PY'
import pathlib, sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'a', compression=zipfile.ZIP_DEFLATED) as apk:
    for dex in sorted(pathlib.Path(sys.argv[2]).glob('*.dex')):
        apk.write(dex, dex.name)
PY
"$BT/zipalign" -f 4 "$BUILD/resources.apk" "$BUILD/aligned.apk"
# Local development signing identity only. This password is not an app PIN or a secret.
mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"
if [[ ! -f "$KEY_DIR/pocket-stars.jks" ]]; then
  (umask 077; keytool -genkeypair -keystore "$KEY_DIR/pocket-stars.jks" -storepass android -keypass android -alias pocket-stars -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Pocket Stars Local Development' -noprompt)
fi
"$BT/apksigner" sign --ks "$KEY_DIR/pocket-stars.jks" --ks-key-alias pocket-stars --ks-pass pass:android --key-pass pass:android --min-sdk-version 26 --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out "$BUILD/signed.apk" "$BUILD/aligned.apk"
"$BT/apksigner" verify --verbose "$BUILD/signed.apk"
"$BT/zipalign" -c 4 "$BUILD/signed.apk"
"$BT/aapt2" dump badging "$BUILD/signed.apk"
cp "$BUILD/signed.apk" "$OUT"
[[ ! -f "$BUILD/signed.apk.idsig" ]] || cp "$BUILD/signed.apk.idsig" "$OUT.idsig"
printf '\nBuilt: %s\n' "$OUT"
sha256sum "$OUT"
