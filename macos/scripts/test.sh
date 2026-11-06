#!/bin/bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
if ! [ -d "$project_root/../extension/node_modules/jsdom" ]; then
    printf '%s\n' 'DOM-Tests benötigen die vorhandenen JS-Testabhängigkeiten: npm --prefix extension ci (im Projektstamm).' >&2
    exit 1
fi
node --test Tests/BrowserSourceTests/*.test.mjs
if ! printenv CLANG_MODULE_CACHE_PATH >/dev/null; then
    export CLANG_MODULE_CACHE_PATH="$project_root/.build/module-cache"
fi
export SWIFTPM_MODULECACHE_OVERRIDE="$CLANG_MODULE_CACHE_PATH"
swift_compiler="$(xcrun --find swiftc)"
testing_plugins="$(dirname "$swift_compiler")/../lib/swift/host/plugins/testing"
if [ -d "$testing_plugins" ]; then
    swift test --disable-sandbox --cache-path "$project_root/.build/cache" -Xswiftc -plugin-path -Xswiftc "$testing_plugins"
else
    swift test --disable-sandbox --cache-path "$project_root/.build/cache"
fi
