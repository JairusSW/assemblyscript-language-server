/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URI } from 'vscode-uri';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isAssemblyScriptDocument } from './documentSelector.js';
import { findNearestAsconfig } from './asconfig.js';

describe('isAssemblyScriptDocument', () => {
    it('claims documents opened with the assemblyscript languageId', () => {
        expect(isAssemblyScriptDocument({ uri: 'file:///proj/foo.ts', languageId: 'assemblyscript' })).toBe(true);
    });

    it('claims .as files regardless of languageId', () => {
        expect(isAssemblyScriptDocument({ uri: 'file:///proj/foo.as' })).toBe(true);
        expect(isAssemblyScriptDocument({ uri: 'file:///proj/foo.as', languageId: 'typescript' })).toBe(true);
    });

    it('does not claim a plain .ts file with no nearby asconfig.json', () => {
        expect(isAssemblyScriptDocument({ uri: 'file:///nonexistent-asls-dir/foo.ts', languageId: 'typescript' })).toBe(false);
    });

    it('does not claim untitled/in-memory documents by extension alone', () => {
        expect(isAssemblyScriptDocument({ uri: 'untitled:Untitled-1', languageId: 'typescript' })).toBe(false);
    });

    it('does not claim non-AssemblyScript extensions', () => {
        expect(isAssemblyScriptDocument({ uri: 'file:///proj/foo.js', languageId: 'javascript' })).toBe(false);
        expect(isAssemblyScriptDocument({ uri: 'file:///proj/foo.tsx', languageId: 'typescriptreact' })).toBe(false);
    });
});

describe('asconfig.json project membership', () => {
    let root: string;

    beforeAll(() => {
        root = mkdtempSync(join(tmpdir(), 'asls-'));
        writeFileSync(join(root, 'asconfig.json'), '{}');
        mkdirSync(join(root, 'assembly'));
        writeFileSync(join(root, 'assembly', 'index.ts'), 'export function add(a: i32, b: i32): i32 { return a + b; }\n');
    });

    afterAll(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('finds the nearest asconfig.json walking up from a nested file', () => {
        expect(findNearestAsconfig(join(root, 'assembly', 'index.ts'))).toBe(join(root, 'asconfig.json'));
    });

    it('claims a .ts file that belongs to an asconfig.json project', () => {
        const fileUri = URI.file(join(root, 'assembly', 'index.ts')).toString();
        expect(isAssemblyScriptDocument({ uri: fileUri, languageId: 'typescript' })).toBe(true);
    });
});
