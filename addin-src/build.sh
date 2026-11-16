#!/usr/bin/env bash
# Régénère public/addin.js (ES5, compatible IE11) depuis src/dataops.ts + addin-src/pane.ts.
# Nécessite TypeScript 5.x ou 6.x (cible ES5 retirée en 7) : npx -p typescript@5.6 tsc ...
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d)
{ sed -E 's/^export //' src/dataops.ts; sed -E '/^declare const (window|document): any;$/d; s/window\.EXCELPRO_API/(window as any).EXCELPRO_API/' addin-src/pane.ts; } > $T/bundle.ts
${TSC:-npx -p typescript@5.6 tsc} --ignoreConfig --target es5 --lib es2019,dom --strict --removeComments --outFile public/addin.js $T/bundle.ts
echo "public/addin.js : $(wc -c < public/addin.js) octets"
