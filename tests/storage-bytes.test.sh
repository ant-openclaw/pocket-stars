#!/usr/bin/env bash
# JVM-only regression tests for the actual production storage encoding helper.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="/home/julia/.hermes/workspace/pocket-stars/storage-bytes"
mkdir -p "$WORK/classes"
"$ROOT/tools/jdk/bin/javac" --release 8 -encoding UTF-8 -d "$WORK/classes" \
  "$ROOT/android/src/app/pocketstars/StorageBytes.java" "$ROOT/tests/StorageBytesTest.java"
"$ROOT/tools/jdk/bin/java" -Xmx512m -cp "$WORK/classes" app.pocketstars.StorageBytesTest
