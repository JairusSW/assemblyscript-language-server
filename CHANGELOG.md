# Changelog

All notable changes to this project will be documented in this file.

This project is a fork of
[`typescript-language-server`](https://github.com/typescript-language-server/typescript-language-server),
repurposed as an AssemblyScript-first language server. Releases up to and
including `5.3.0` are inherited from the upstream project; see its
[changelog](https://github.com/typescript-language-server/typescript-language-server/blob/master/CHANGELOG.md)
for that history. Entries below cover changes made in this fork.

## Unreleased

### Changed

* Rebrand from `typescript-language-server` to `assemblyscript-language-server`:
  package name, `bin`, CLI command, repository metadata, and documentation.
* **BREAKING:** rename workspace command namespace `_typescript.*` →
  `_assemblyscript.*` (e.g. `_assemblyscript.goToSourceDefinition`,
  `_assemblyscript.applyRefactoring`, `_assemblyscript.organizeImports`).
* **BREAKING:** rename the post-initialize version notification
  `$/typescriptVersion` → `$/assemblyscriptVersion`. While the TypeScript
  fallback (`tsserver`) is the only analysis engine, it continues to report the
  TypeScript version.

### Added

* Add `assemblyscript` as a runtime dependency (the compiler API that will back
  AssemblyScript-native analysis).
* Document the AssemblyScript routing model (language ID, `.as` extension,
  `asconfig.json` projects, and the TypeScript/JavaScript fallback) in the
  README.
