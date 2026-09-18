# Pinned icon package

`archmap-icons-0.1.3.tgz` is built from the clean `archmap-icons` source commit
`26d5d6a1be8d3b00b9d783397685fc0d19a384e9` (package version 0.1.3).
That commit includes the 98-service expansion and Apache-2.0 license adoption.
At integration time it exists in the local source repository; npm and the
upstream GitHub default branch still distribute version 0.1.2.

The snapshot is committed here so Pages builds do not depend on a sibling
checkout, an unpublished npm version, or a moving Git branch. npm verifies the
archive using the integrity entry in `package-lock.json`. It contains compiled
JavaScript, declarations, catalog documentation, LICENSE and NOTICE; installation
does not require lifecycle scripts.

SHA-256: `9142a3522a5a66daa113aa047c25c2176c99154692d37967e4044071b78aad8d`

To update, export the intended clean source revision into a temporary directory,
install its build dependencies, compile with its `tsconfig.json`, and run
`npm pack --ignore-scripts --pack-destination <archmap>/vendor` from that directory.
Install the resulting archive with `npm install --save-dev ./vendor/<archive>`.
Update this provenance and the third-party notice, then run
`npm run verify:diagrams`. `test/focused-icons.test.ts` checks every registered
package key and alias against both the DSL and the renderer.

Once the same version is published, the dependency can return to the npm registry
after confirming catalog and asset equivalence. Do not modify the bundled SVG
assets separately from the source package.
