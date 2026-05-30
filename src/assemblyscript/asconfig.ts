/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

export const ASCONFIG_FILENAME = 'asconfig.json';

/**
 * Walk up from the directory containing `filePath` looking for the nearest
 * `asconfig.json`. Returns its absolute path, or `undefined` if none is found
 * before reaching the filesystem root.
 *
 * This is the Phase 0 project-membership heuristic: a `.ts` file is considered
 * part of an AssemblyScript project when it lives under a directory tree that
 * contains an `asconfig.json`. Precise membership (resolving the config's
 * `entries`/import graph) is a later phase.
 */
export function findNearestAsconfig(filePath: string): string | undefined {
    let dir = dirname(filePath);
    const root = parse(dir).root;
    for (;;) {
        const candidate = join(dir, ASCONFIG_FILENAME);
        if (existsSync(candidate)) {
            return candidate;
        }
        if (dir === root) {
            return undefined;
        }
        dir = dirname(dir);
    }
}
