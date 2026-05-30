/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { findNearestAsconfig } from './asconfig.js';

/** The default `asconfig.json` target when none is selected (matches `asc`). */
export const DEFAULT_TARGET = 'release';

/** A config-resolution problem, reported against the offending `asconfig.json`. */
export interface ProjectConfigDiagnostic {
    /** Absolute path of the `asconfig.json` the problem belongs to. */
    configPath: string;
    severity: 'error' | 'warning';
    message: string;
}

/** The raw shape of an `asconfig.json` (loosely typed, as the compiler reads it). */
interface AsconfigJson {
    extends?: string;
    entries?: string[];
    options?: Record<string, unknown>;
    targets?: Record<string, Record<string, unknown>>;
    [key: string]: unknown;
}

/** A resolved AssemblyScript project for a given config + selected target. */
export interface ResolvedProject {
    /** Absolute path to the project's `asconfig.json`. */
    configPath: string;
    /** Directory containing the config (the project base directory). */
    baseDir: string;
    /** The selected target name. */
    target: string;
    /** Target names declared by the config (and any it extends). */
    availableTargets: string[];
    /** Entry files, resolved to absolute paths. */
    entries: string[];
    /** Compiler options after merging `extends` < top-level < selected target. */
    options: Record<string, unknown>;
    /** Config-resolution problems collected while resolving this project. */
    diagnostics: ProjectConfigDiagnostic[];
}

/**
 * Discovers and resolves AssemblyScript projects from `asconfig.json`.
 *
 * Resolution mirrors `asc`'s configuration model: a config may `extends`
 * another (the parent provides a base), top-level `options` override the parent,
 * and the selected `targets[target]` options override the top-level ones.
 * Entries are resolved relative to the config's directory.
 *
 * Note: option-array merge fidelity (e.g. `--enable`/`--disable` concatenation)
 * is approximate here — when the compile service runs, it delegates the
 * authoritative merge to `asc` so the language server never drifts from the
 * compiler. This resolver exists to discover project structure, expose entries
 * and the selected target, and surface config errors.
 */
export class AsProjectService {
    private readonly cache = new Map<string, ResolvedProject>();

    /** Locate the `asconfig.json` that owns `filePath`, if any. */
    findProjectConfig(filePath: string): string | undefined {
        return findNearestAsconfig(filePath);
    }

    /**
     * Resolve the project that owns `filePath` for the given target. Returns
     * `undefined` when the file is not part of any `asconfig.json` project.
     */
    resolveProjectForFile(filePath: string, target: string = DEFAULT_TARGET): ResolvedProject | undefined {
        const configPath = this.findProjectConfig(filePath);
        if (!configPath) {
            return undefined;
        }
        return this.resolveProject(configPath, target);
    }

    /** Resolve a project by its config path for the given target (cached). */
    resolveProject(configPath: string, target: string = DEFAULT_TARGET): ResolvedProject {
        const cacheKey = `${configPath}::${target}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const resolved = this.resolveProjectUncached(configPath, target);
        this.cache.set(cacheKey, resolved);
        return resolved;
    }

    /** Drop cached resolutions for a config (call when the config or one it extends changes). */
    invalidate(configPath: string): void {
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${configPath}::`)) {
                this.cache.delete(key);
            }
        }
    }

    /** Drop the entire resolution cache. */
    invalidateAll(): void {
        this.cache.clear();
    }

    private resolveProjectUncached(configPath: string, target: string): ResolvedProject {
        const diagnostics: ProjectConfigDiagnostic[] = [];
        const baseDir = dirname(configPath);
        const merged = this.loadAndMerge(configPath, target, diagnostics, new Set());

        const availableTargets = Object.keys(merged.targets ?? {});
        if (target !== DEFAULT_TARGET && !availableTargets.includes(target)) {
            diagnostics.push({
                configPath,
                severity: 'warning',
                message: `Target "${target}" is not defined in this asconfig.json. Using top-level options.`,
            });
        }

        const entries = (merged.entries ?? []).map(entry =>
            isAbsolute(entry) ? entry : resolvePath(baseDir, entry));

        return {
            configPath,
            baseDir,
            target,
            availableTargets,
            entries,
            options: merged.options ?? {},
            diagnostics,
        };
    }

    /**
     * Load a config (resolving `extends` first as the base), then overlay this
     * config's top-level `options` and the selected target's options.
     */
    private loadAndMerge(
        configPath: string,
        target: string,
        diagnostics: ProjectConfigDiagnostic[],
        seen: Set<string>,
    ): AsconfigJson {
        if (seen.has(configPath)) {
            diagnostics.push({ configPath, severity: 'error', message: `Circular "extends" detected at ${configPath}.` });
            return {};
        }
        seen.add(configPath);

        const config = this.readConfig(configPath, diagnostics);
        if (!config) {
            return {};
        }

        let base: AsconfigJson = {};
        if (typeof config.extends === 'string') {
            const baseDir = dirname(configPath);
            const parentPath = isAbsolute(config.extends) ? config.extends : resolvePath(baseDir, config.extends);
            if (existsSync(parentPath)) {
                base = this.loadAndMerge(parentPath, target, diagnostics, seen);
            } else {
                diagnostics.push({
                    configPath,
                    severity: 'error',
                    message: `Cannot find extended config "${config.extends}" (resolved to ${parentPath}).`,
                });
            }
        }

        const targetOptions = config.targets?.[target] ?? {};
        const baseOptions = base.options ?? {};
        const topLevelOptions = config.options ?? {};
        return {
            extends: config.extends,
            entries: config.entries ?? base.entries,
            targets: { ...base.targets, ...config.targets },
            options: {
                ...baseOptions,
                ...topLevelOptions,
                ...targetOptions,
            },
        };
    }

    private readConfig(configPath: string, diagnostics: ProjectConfigDiagnostic[]): AsconfigJson | undefined {
        let text: string;
        try {
            text = readFileSync(configPath, 'utf8');
        } catch (err) {
            diagnostics.push({ configPath, severity: 'error', message: `Cannot read asconfig.json: ${(err as Error).message}` });
            return undefined;
        }
        try {
            return JSON.parse(text) as AsconfigJson;
        } catch (err) {
            diagnostics.push({ configPath, severity: 'error', message: `Invalid JSON in asconfig.json: ${(err as Error).message}` });
            return undefined;
        }
    }
}
