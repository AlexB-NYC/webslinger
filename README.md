# Webslinger

Webslinger is maintained as browser-focused source modules in `src/`. Generated bundles are not committed to the repository.

## Build outputs

Run `npm ci` followed by `npm run build` to generate:

- `dist/webslinger.js` — readable production bundle with logging disabled
- `dist/webslinger.min.js` — minified production bundle with logging disabled
- `dist/webslinger.dev.js` — readable development bundle with structured diagnostic logging

All three files expose the `Webslinger` constructor as `globalThis.Webslinger` for drop-in browser use.

## Continuous builds

Pull requests into `development` build and verify the bundles. Every push to the default `development` branch also uploads the three files together as a GitHub Actions artifact named for the commit SHA. The workflow does not create a GitHub Release.

Development diagnostics use the format `[Webslinger][Component][LEVEL] Event` and avoid logging payloads, encryption material, session tokens, clipboard contents, and other sensitive values.
