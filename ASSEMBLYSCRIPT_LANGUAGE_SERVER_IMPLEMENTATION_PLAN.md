# AssemblyScript Language Server Implementation Plan

## Summary

This repository is currently a thin LSP wrapper around `tsserver`: `LspServer` owns most LSP handlers, `TsClient` owns document sync and diagnostics, and feature helpers translate `ts.server.protocol.*` into LSP objects. The implementation should introduce an AssemblyScript-native service and route `.as` and AssemblyScript-project `.ts` files through it while keeping TypeScript fallback as a temporary compatibility path.

## Large Steps

1. Rebrand and dependency baseline
   - Rename package, bin, docs, and CLI from `typescript-language-server` to `assemblyscript-language-server`.
   - Add `assemblyscript` as the compiler/runtime analysis dependency.
   - Keep `typescript` only for build/dev and optional fallback.
   - Rename public custom commands and notifications from `_typescript.*` / `$/typescriptVersion` to AssemblyScript equivalents where they remain relevant.
   - Update README and configuration docs for `.as`, `assemblyscript` language ID, `asconfig.json`, and fallback behavior.

2. Split the server around a language-service router
   - Introduce a small service contract that returns LSP-native or server-owned DTOs instead of `ts.server.protocol` types.
   - Move document ownership out of `TsClient`-specific `LspDocuments` into a shared document registry used by both AS and legacy TS services.
   - Route `.as` and `languageId: assemblyscript` to the AssemblyScript service.
   - Route `.ts` to the AssemblyScript service when it is included by nearest `asconfig.json`, under an AS project entry graph, or opened as `assemblyscript`.
   - Keep JS/TS fallback routed to `TsClient` during migration.
   - Refactor `LspServer` handlers to call the router first, then service-specific adapters.

3. Build the AssemblyScript project service
   - Add `AsProjectService` for `asconfig.json` discovery, `extends`, `entries`, `targets`, `options`, transform options, runtime/memory/table options, and `--use` constants.
   - Add virtual file overlays so unsaved open buffers are analyzed instead of disk contents.
   - Cache projects by config path plus selected target.
   - Invalidate on document changes and watched file/config changes.
   - Provide source/range mapping utilities from AssemblyScript compiler locations into LSP ranges.
   - Report config, transform, and compiler load errors as project diagnostics instead of failing the server.

4. Implement AssemblyScript diagnostics and type facts first
   - Convert AssemblyScript compiler diagnostics to LSP diagnostics with `source: "assemblyscript"`.
   - Add server-owned diagnostics for numeric range and precision loss, invalid primitive conversions, invalid decorators, invalid or ambiguous operator overloads, invalid binary/unary/index expressions, feature-gated intrinsics/std APIs, and import/export ABI risks.
   - Build a type-fact layer that resolves primitive widths, generics, overloads, inheritance, interfaces, enums, nullable refs, managed/unmanaged/external types, compiler intrinsics, and expression result types.
   - Make `BinaryExpression` validation explicit: resolve operands, apply built-in operator rules, apply `@operator` overload lookup, then surface result type or a targeted diagnostic.

5. Migrate core LSP features to AssemblyScript
   - Implement AS-backed diagnostics, hover, document symbols, workspace symbols, definitions, references, rename, folding, semantic tokens, completion, completion resolve, signature help, and inlay hints.
   - Keep TypeScript protocol translation helpers for fallback only.
   - Add AS-specific translators for symbols, diagnostics, completions, semantic tokens, call hierarchy, and text edits.
   - Ensure hover and completion show real AssemblyScript types like `u64`, `i32`, `f32`, and `usize`, not `number`.
   - Add decorator completions after `@`, stdlib/intrinsic completions, import completions, and operator/decorator metadata in hover where useful.

6. Port code actions and commands conservatively
   - Disable TypeScript-specific refactors and code actions for AS documents until replaced.
   - Implement AS-safe actions only: organize/sort imports, add missing import, remove unused import when compiler facts support it, insert explicit cast, suggest correct numeric literal suffix/cast, and fix invalid decorator/operator spelling where deterministic.
   - Rework command names and execution payloads away from TypeScript request args.
   - Keep `typescript.tsserverRequest` only for fallback TS documents or remove it from AS-facing docs.

7. Add watchers and incremental invalidations
   - Extend file operation filters to include `.as`, `asconfig.json`, config `extends`, transform files, stdlib/project imports, and AS `.ts` files.
   - Route file changes to `AsProjectService` invalidation instead of `tsserver` watch events.
   - Refresh diagnostics, code lenses, inlay hints, and semantic tokens when project config or target changes.
   - Keep current client watcher plumbing where useful, but stop treating it as tsserver-only.

8. Expand test harness and fixtures
   - Add AS fixture projects under `test-data/assemblyscript/` with `.as`, AS `.ts`, multiple `asconfig.json` targets, config `extends`, imports, decorators, operator overloads, transforms, and feature-gated APIs.
   - Extend test utilities to open `assemblyscript` documents and wait for AS diagnostics without expecting three tsserver diagnostic kinds.
   - Keep existing TypeScript fallback tests initially.
   - As features migrate, split tests into AS-first and TS-fallback suites.
   - Add regression tests for unsaved buffer overlays and config invalidation.

9. Harden, document, and prepare release
   - Run and fix `pnpm build`, `pnpm lint`, `pnpm test`, and focused AS integration tests.
   - Document supported 1.0 behavior, unsupported TS refactors, target selection, config resolution, and known transform limitations.
   - Add troubleshooting docs for invalid configs, missing AssemblyScript dependency, transform load failures, and editor language ID setup.
   - Update changelog and release notes for the fork identity and migration from TypeScript server semantics.

## Important Interface Changes

- Add `assemblyscript` language ID and `.as` document support.
- Add AS service interfaces that return LSP-native concepts:
  - diagnostics,
  - symbol locations,
  - hover info,
  - completion entries/details,
  - semantic tokens,
  - text edits,
  - project metadata.
- Add AS initialization/config options:
  - selected target default,
  - optional legacy TS fallback,
  - optional compiler path override,
  - diagnostics toggles for precision, ABI, and feature-gated warnings.
- Add server diagnostic code ranges for AssemblyScript-specific warnings and errors.

## Test Plan

- Project/config tests:
  - nearest `asconfig.json`,
  - `extends`,
  - multiple targets,
  - `entries`,
  - `options`,
  - transforms,
  - `--use`,
  - missing config,
  - bad config.
- Document routing tests:
  - `.as`,
  - `languageId: assemblyscript`,
  - AS-project `.ts`,
  - legacy TS fallback.
- Diagnostics tests:
  - decorators,
  - numeric bounds,
  - precision warnings,
  - casts,
  - invalid assignments,
  - BinaryExpression validation,
  - unary/index operators,
  - `@operator` overloads.
- LSP feature tests:
  - hover,
  - completion,
  - completion resolve,
  - signature help,
  - inlay hints,
  - definitions,
  - references,
  - rename,
  - document/workspace symbols,
  - semantic tokens,
  - folding.
- Incremental behavior tests:
  - unsaved buffer diagnostics,
  - project invalidation on config/import changes,
  - close/reopen behavior.
- Compatibility tests:
  - existing TypeScript tests either still pass under fallback or are explicitly moved out of AS scope.

## Assumptions

- The 1.0 target is AssemblyScript-first; `tsserver` is fallback only.
- `.as` is first-class, and `.ts` is supported when it belongs to an AssemblyScript project.
- `asconfig.json` is the source of truth for AS analysis.
- AssemblyScript compiler APIs are authoritative for syntax and semantic checks.
- Custom diagnostics augment compiler truth but do not replace it.
- Formatting and advanced refactors can be conservative until the AS semantic layer is stable.
