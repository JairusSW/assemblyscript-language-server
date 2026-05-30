/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { uri, createServer, type TestLspServer } from '../test-utils.js';

let server: TestLspServer;
const diagnostics = new Map<string, lsp.PublishDiagnosticsParams>();

beforeAll(async () => {
    server = await createServer({
        rootUri: uri(),
        publishDiagnostics: args => diagnostics.set(args.uri, args),
    });
});

afterAll(() => {
    server.closeAllForTesting();
    server.shutdown();
});

describe('AssemblyScript document routing', () => {
    it('opens, changes and closes a .as document without error and never hands it to tsserver', async () => {
        const docUri = uri('routing-smoke.as');
        const textDocument = {
            uri: docUri,
            languageId: 'assemblyscript',
            version: 1,
            // AssemblyScript-specific syntax that stock tsserver would flag.
            text: '@inline export function add(a: i32, b: i32): i32 { return a + b; }\n',
        };

        expect(() => server.didOpenTextDocument({ textDocument })).not.toThrow();
        expect(server.assemblyScriptServiceForTesting.documentsForTesting.size).toBe(1);

        // A TypeScript feature request for the AssemblyScript document must not crash;
        // the TS backend doesn't own it, so it returns an empty result.
        await expect(server.hover({ textDocument: { uri: docUri }, position: { line: 0, character: 0 } })).resolves.toEqual({ contents: [] });

        expect(() => server.didChangeTextDocument({
            textDocument: { uri: docUri, version: 2 },
            contentChanges: [{ text: 'export function sub(a: i32, b: i32): i32 { return a - b; }\n' }],
        })).not.toThrow();

        expect(() => server.didCloseTextDocument({ textDocument: { uri: docUri } })).not.toThrow();
        expect(server.assemblyScriptServiceForTesting.documentsForTesting.size).toBe(0);

        // Closing clears any diagnostics the AssemblyScript service owns for the file.
        expect(diagnostics.get(docUri)?.diagnostics).toEqual([]);
    });

    it('publishes AssemblyScript syntax diagnostics for an invalid .as document', () => {
        const docUri = uri('syntax-error.as');
        server.didOpenTextDocument({
            textDocument: {
                uri: docUri,
                languageId: 'assemblyscript',
                version: 1,
                text: 'export function add(a: i32, b: i32): i32 { return a + }\n',
            },
        });

        const published = diagnostics.get(docUri)?.diagnostics ?? [];
        expect(published.length).toBeGreaterThan(0);
        expect(published[0].source).toBe('assemblyscript');
        expect(published[0].severity).toBe(lsp.DiagnosticSeverity.Error);

        server.didCloseTextDocument({ textDocument: { uri: docUri } });
    });

    it('publishes no diagnostics for a valid .as document', () => {
        const docUri = uri('valid.as');
        server.didOpenTextDocument({
            textDocument: {
                uri: docUri,
                languageId: 'assemblyscript',
                version: 1,
                text: '@inline export function add(a: i32, b: i32): i32 { return a + b; }\n',
            },
        });

        expect(diagnostics.get(docUri)?.diagnostics).toEqual([]);

        server.didCloseTextDocument({ textDocument: { uri: docUri } });
    });
});
