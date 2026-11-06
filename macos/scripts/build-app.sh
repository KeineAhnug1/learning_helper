#!/bin/bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
if ! printenv CLANG_MODULE_CACHE_PATH >/dev/null; then
    export CLANG_MODULE_CACHE_PATH="$project_root/.build/module-cache"
fi
export SWIFTPM_MODULECACHE_OVERRIDE="$CLANG_MODULE_CACHE_PATH"
swift build -c release -debug-info-format none --disable-sandbox --cache-path "$project_root/.build/cache"
binary_path="$(swift build -c release -debug-info-format none --show-bin-path --disable-sandbox --cache-path "$project_root/.build/cache")"
app_path="$project_root/build/Learning Helper.app"
mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
cp "$binary_path/LearningHelper" "$app_path/Contents/MacOS/LearningHelper"
cp "$project_root/Resources/Info.plist" "$app_path/Contents/Info.plist"
for resource in "$binary_path"/*.bundle; do
    [ -d "$resource" ] || continue
    cp -R "$resource" "$app_path/Contents/Resources/"
done
codesign --force --sign - --identifier de.learning-helper.questions "$app_path"
codesign --verify --strict "$app_path"
"$app_path/Contents/MacOS/LearningHelper" --self-test
printf '%s\n' "$app_path"
