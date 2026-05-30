/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AsProjectService } from './asProjectService.js';

let root: string;
let service: AsProjectService;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asls-proj-'));
    service = new AsProjectService();
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function write(relPath: string, contents: string): string {
    const abs = join(root, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, contents);
    return abs;
}

describe('AsProjectService', () => {
    it('resolves entries relative to the config directory', () => {
        write('asconfig.json', JSON.stringify({ entries: ['assembly/index.ts'], options: { runtime: 'minimal' } }));
        const memberFile = write('assembly/index.ts', 'export function f(): void {}\n');

        const project = service.resolveProjectForFile(memberFile);
        expect(project).toBeDefined();
        expect(project!.entries).toEqual([join(root, 'assembly/index.ts')]);
        expect(project!.options.runtime).toBe('minimal');
        expect(project!.diagnostics).toEqual([]);
    });

    it('merges target options over top-level options', () => {
        write('asconfig.json', JSON.stringify({
            options: { runtime: 'incremental', optimizeLevel: 1 },
            targets: { release: { optimizeLevel: 3 }, debug: { debug: true } },
        }));

        const release = service.resolveProject(join(root, 'asconfig.json'), 'release');
        expect(release.options.optimizeLevel).toBe(3);
        expect(release.options.runtime).toBe('incremental');
        expect(release.availableTargets).toEqual(expect.arrayContaining(['release', 'debug']));

        const debug = service.resolveProject(join(root, 'asconfig.json'), 'debug');
        expect(debug.options.debug).toBe(true);
        expect(debug.options.optimizeLevel).toBe(1);
    });

    it('resolves `extends`, with the child overriding the parent', () => {
        write('base.json', JSON.stringify({ options: { runtime: 'incremental', importMemory: true } }));
        write('asconfig.json', JSON.stringify({ extends: './base.json', options: { runtime: 'minimal' } }));

        const project = service.resolveProject(join(root, 'asconfig.json'));
        expect(project.options.runtime).toBe('minimal'); // child wins
        expect(project.options.importMemory).toBe(true); // inherited from parent
        expect(project.diagnostics).toEqual([]);
    });

    it('reports a diagnostic for invalid JSON', () => {
        write('asconfig.json', '{ not valid json ');
        const project = service.resolveProject(join(root, 'asconfig.json'));
        expect(project.diagnostics).toHaveLength(1);
        expect(project.diagnostics[0].severity).toBe('error');
        expect(project.diagnostics[0].message).toMatch(/Invalid JSON/);
    });

    it('reports a diagnostic for a missing extended config', () => {
        write('asconfig.json', JSON.stringify({ extends: './does-not-exist.json' }));
        const project = service.resolveProject(join(root, 'asconfig.json'));
        expect(project.diagnostics.some(d => /Cannot find extended config/.test(d.message))).toBe(true);
    });

    it('warns when a non-default target is not defined', () => {
        write('asconfig.json', JSON.stringify({ options: {} }));
        const project = service.resolveProject(join(root, 'asconfig.json'), 'no-such-target');
        expect(project.diagnostics.some(d => d.severity === 'warning' && /not defined/.test(d.message))).toBe(true);
    });

    it('caches resolutions and invalidates them', () => {
        const configPath = write('asconfig.json', JSON.stringify({ options: { runtime: 'incremental' } }));
        const first = service.resolveProject(configPath);
        const second = service.resolveProject(configPath);
        expect(second).toBe(first); // cached identity

        service.invalidate(configPath);
        const third = service.resolveProject(configPath);
        expect(third).not.toBe(first); // re-resolved
    });
});
