#!/usr/bin/env bash
# JVM-only tests for the production monotonic idle and wake-gesture policy.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="/home/julia/.hermes/workspace/pocket-stars/idle-policy"
mkdir -p "$WORK/classes"
"$ROOT/tools/jdk/bin/javac" --release 8 -encoding UTF-8 -d "$WORK/classes" \
  "$ROOT/android/src/app/pocketstars/IdlePolicy.java" "$ROOT/tests/IdlePolicyTest.java"
"$ROOT/tools/jdk/bin/java" -cp "$WORK/classes" app.pocketstars.IdlePolicyTest
