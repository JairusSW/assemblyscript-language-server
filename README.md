# AssemblyScript Language Server

<!-- MarkdownTOC -->

- [What is it, exactly?](#what-is-it-exactly)
- [Installing](#installing)
- [Running the language server](#running-the-language-server)
- [CLI Options](#cli-options)
- [Configuration](#configuration)
- [AssemblyScript support](#assemblyscript-support)
- [Features](#features)
    - [Code actions on save](#code-actions-on-save)
    - [Workspace commands \(`workspace/executeCommand`\)](#workspace-commands-workspaceexecutecommand)
        - [Go to Source Definition](#go-to-source-definition)
        - [Apply Refactoring](#apply-refactoring)
        - [Organize Imports](#organize-imports)
        - [Rename File](#rename-file)
        - [Send Tsserver Command](#send-tsserver-command)
        - [Configure plugin](#configure-plugin)
    - [Code Lenses \(`textDocument/codeLens`\)](#code-lenses-textdocumentcodelens)
    - [Inlay hints \(`textDocument/inlayHint`\)](#inlay-hints-textdocumentinlayhint)
    - [Language Server Version Notification](#language-server-version-notification)
    - [Workspace Configuration request for formatting settings](#workspace-configuration-request-for-formatting-settings)
- [Development](#development)
    - [Build](#build)
    - [Dev](#dev)
    - [Test](#test)
    - [Publishing](#publishing)

<!-- /MarkdownTOC -->

## What is it, exactly?

[AssemblyScript](https://www.assemblyscript.org) is a variant of TypeScript that compiles to WebAssembly. It has its own compiler (`asc`), its own project configuration (`asconfig.json`), its own numeric type system (`i32`, `u64`, `f32`, `usize`, …), and language features (decorators like `@inline`/`@external`/`@operator`, operator overloading) that a stock TypeScript language server does not understand. The aim of this project is to provide a [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) implementation that understands AssemblyScript natively, so any LSP-capable editor gets correct diagnostics, hovers, completions, and navigation for `.as` and AssemblyScript `.ts` files.

This is a fork of the excellent [`typescript-language-server`](https://github.com/typescript-language-server/typescript-language-server) (originally based on concepts from https://github.com/prabirshrestha/typescript-language-server and maintained by [TypeFox](https://typefox.io) and its contributors). It reuses that project's LSP transport, document handling, and protocol plumbing while replacing the source of truth with AssemblyScript-native analysis.

> **Status:** AssemblyScript-native analysis is being introduced in phases. Until a given feature is backed by the AssemblyScript compiler, the server falls back to `tsserver` for TypeScript/JavaScript documents. See the [AssemblyScript support](#assemblyscript-support) section for what is wired up today.

## Installing

```sh
npm install -g assemblyscript-language-server
```

The `assemblyscript` compiler is bundled as a dependency. For projects that still
rely on the TypeScript/JavaScript fallback, install `typescript` in the workspace
as usual.

## Running the language server

```
assemblyscript-language-server --stdio
```

## CLI Options

```
  Usage: assemblyscript-language-server [options]


  Options:

    -V, --version                          output the version number
    --stdio                                use stdio (required option)
    --log-level <log-level>                A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `3`.
    -h, --help                             output usage information
```

## Configuration

See [configuration documentation](./docs/configuration.md).

## AssemblyScript support

This server is being converted from a TypeScript-first LSP into an
AssemblyScript-first one. The sections below describe the project's intent and
the routing model; individual features are migrated to AssemblyScript-native
analysis in phases.

### Document identity

A document is treated as AssemblyScript when **any** of the following hold:

 - it uses the `assemblyscript` language ID, or
 - it has the `.as` extension, or
 - it is a member of a project described by a nearby `asconfig.json` (including
   the conventional `assembly/` directory, where AssemblyScript projects use
   `.ts` entries).

`.as` and AssemblyScript-flavored `.ts` are **co-equal** — neither is the
"primary" extension. For any `.ts` that belongs to an AssemblyScript project,
AssemblyScript analysis takes ownership so that diagnostics are not produced
twice.

### Projects (`asconfig.json`)

[`asconfig.json`](https://www.assemblyscript.org/compiler.html#configuration-file)
is the source of project truth for AssemblyScript: it declares `entries`,
compiler `options`, named `targets`, and may `extends` another config. The
server discovers the nearest `asconfig.json` from an open file upward to the
workspace root and analyzes the file in that project's context. A
`tsconfig.json` (e.g. `assembly/tsconfig.json`) is used only for editor/standard
-library compatibility where AssemblyScript expects it.

### TypeScript / JavaScript fallback

Plain TypeScript and JavaScript documents that are **not** part of an
AssemblyScript project continue to be served by `tsserver` as a compatibility
fallback. AssemblyScript documents do not rely on `tsserver` for their semantic
truth.

## Features

### Code actions on save

Server announces support for the following code action kinds:

 - `source.fixAll.ts` - despite the name, fixes a couple of specific issues: unreachable code, await in non-async functions, incorrectly implemented interface
 - `source.removeUnused.ts` - removes declared but unused variables
 - `source.addMissingImports.ts` - adds imports for used but not imported symbols
 - `source.removeUnusedImports.ts` - removes unused imports
 - `source.sortImports.ts` - sorts imports
 - `source.organizeImports.ts` - organizes and removes unused imports

This allows editors that support running code actions on save to automatically run fixes associated with those kinds.

Those code actions, if they apply in the current code, should also be presented in the list of "Source Actions" if the editor exposes those.

The user can enable it with a setting similar to (can vary per-editor):

```js
"codeActionsOnSave": {
    "source.organizeImports.ts": true,
    // or just
    "source.organizeImports": true,
}
```

### Workspace commands (`workspace/executeCommand`)

See [LSP specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_executeCommand).

Most of the time, you'll execute commands with arguments retrieved from another request like `textDocument/codeAction`. There are some use cases for calling them manually.

`lsp` refers to the language server protocol types, `tsp` refers to the typescript server protocol types.

#### Go to Source Definition

Request:

```ts
{
    command: '_assemblyscript.goToSourceDefinition'
    arguments: [
        lsp.DocumentUri,  // String URI of the document
        lsp.Position,     // Line and character position (zero-based)
    ]
}
```

Response:

```ts
lsp.Location[] | null
```

(This command is supported from Typescript 4.7.)

#### Apply Refactoring

Request:

```ts
{
    command: '_assemblyscript.applyRefactoring'
    arguments: [
        tsp.GetEditsForRefactorRequestArgs,
    ]
}
```

Response:

```ts
void
```

#### Organize Imports

Request:

```ts
{
    command: '_assemblyscript.organizeImports'
    arguments: [
        string,  // file path
        // Optional options:
        {
            // @deprecated - use "mode". Supported from Typescript 4.4+.
            skipDestructiveCodeActions?: boolean
            // 'All' - organizes imports including destructive actions (removing unused imports)
            // 'SortAndCombine' - Doesn't perform destructive actions.
            // 'RemoveUnused' - Only removes unused imports.
            mode?: 'All' | 'SortAndCombine' | 'RemoveUnused'
        },
    ]
}
```

Response:

```ts
void
```

#### Rename File

Request:

```ts
{
    command: '_assemblyscript.applyRenameFile'
    arguments: [
        { sourceUri: string; targetUri: string; },
    ]
}
```

Response:

```ts
void
```

#### Send Tsserver Command

Request:

```ts
{
    command: 'typescript.tsserverRequest'
    arguments: [
        string,       // command
        any,          // command arguments in a format that the command expects
        ExecuteInfo,  // configuration object used for the tsserver request (see below)
    ]
}
```

Response:

```ts
any
```

The `ExecuteInfo` object is defined as follows:

```ts
type ExecuteInfo = {
    executionTarget?: number;  // 0 - semantic server, 1 - syntax server; default: 0
    expectsResult?: boolean;   // default: true
    isAsync?: boolean;         // default: false
    lowPriority?: boolean;     // default: true
};
```

#### Configure plugin

Request:

```ts
{
    command: '_assemblyscript.configurePlugin'
    arguments: [pluginName: string, configuration: any]
}
```

Response:

```ts
void
```

### Code Lenses (`textDocument/codeLens`)

Code lenses can be enabled using the `implementationsCodeLens` and `referencesCodeLens` [workspace configuration options](/docs/configuration.md/#workspacedidchangeconfiguration).

Code lenses provide a count of **references** and/or **implemenations** for symbols in the document. For clients that support it it's also possible to click on those to navigate to the relevant locations in the the project. Do note that clicking those trigger a `editor.action.showReferences` command which is something that client needs to have explicit support for. Many do by default but some don't. An example command will look like this:

```ts
command: {
    title: '1 reference',
    command: 'editor.action.showReferences',
    arguments: [
        'file://project/foo.ts',    // URI
        { line: 1, character: 1 },  // Position
        [                           // A list of Location objects.
            {
                uri: 'file://project/bar.ts',
                range: {
                    start: {
                        line: 7,
                        character: 24,
                    },
                    end: {
                        line: 7,
                        character: 28,
                    },
                },
            },
        ],
    ],
}
```

### Inlay hints (`textDocument/inlayHint`)

For the request to return any results, some or all of the following options need to be enabled through `preferences`:

```ts
export interface InlayHintsOptions extends UserPreferences {
    includeInlayParameterNameHints: 'none' | 'literals' | 'all';
    includeInlayParameterNameHintsWhenArgumentMatchesName: boolean;
    includeInlayFunctionParameterTypeHints: boolean;
    includeInlayVariableTypeHints: boolean;
    includeInlayVariableTypeHintsWhenTypeMatchesName: boolean;
    includeInlayPropertyDeclarationTypeHints: boolean;
    includeInlayFunctionLikeReturnTypeHints: boolean;
    includeInlayEnumMemberValueHints: boolean;
}
```

### Language Server Version Notification

Right after initializing, the server sends a custom `$/assemblyscriptVersion` notification that carries information about the version of the underlying analysis engine. The editor can then display that information in the UI. While the TypeScript fallback (`tsserver`) is the only engine, this carries the TypeScript version.

The `$/assemblyscriptVersion` notification params include two properties:

 - `version` - a semantic version (for example `4.8.4`)
 - `source` - a string specifying whether the version comes from the local workspace (`workspace`), is explicitly specified through a `initializationOptions.tsserver.path` setting (`user-setting`) or was bundled with the server (`bundled`)


### Workspace Configuration request for formatting settings

Server asks the client (provided client supports `workspace/configuration` capability) for file-specific configuration options (`tabSize` and `insertSpaces`) that are required by `tsserver` to properly format file edits when for example using "Organize imports" or performing other file modifications. Those options have to be dynamically provided by the client/editor since the values can differ for each file. For this reason server sends a `workspace/configuration` request with `scopeUri` equal to file's URI and `section` equal to `formattingOptions`. The client is expected to return a configuration that includes the following properties:

```js
{
    "tabSize": number
    "insertSpaces": boolean
}
```

## Development

### Build

```sh
pnpm build
```

### Dev

Build and rebuild on change.

```sh
pnpm dev
```

### Test

 - `pnpm test` - run all tests in watch mode for developing
 - `pnpm test:commit` - run all tests once

By default only console logs of level `warning` and higher are printed to the console. You can override the `CONSOLE_LOG_LEVEL` level in `package.json` to either `log`, `info`, `warning` or `error` to log other levels.

### Publishing

The project uses https://github.com/google-github-actions/release-please-action Github action to automatically release new version on merging a release PR.

[npm-version-src]: https://img.shields.io/npm/dt/assemblyscript-language-server.svg?style=flat-square
[npm-version-href]: https://npmjs.com/package/assemblyscript-language-server
[npm-downloads-src]: https://img.shields.io/npm/v/assemblyscript-language-server/latest.svg?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/assemblyscript-language-server
[discord-src]: https://img.shields.io/discord/721472913886281818?style=flat-square
[discord-href]: https://discord.gg/assemblyscript
