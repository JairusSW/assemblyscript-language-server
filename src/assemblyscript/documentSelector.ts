/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { extname } from 'node:path';
import { URI } from 'vscode-uri';
import * as languageIds from '../configuration/languageIds.js';
import { findNearestAsconfig } from './asconfig.js';

export interface DocumentIdentity {
    /** The document URI (string form). */
    uri: string;
    /** The client-provided language ID, if any. */
    languageId?: string;
}

/** Returns the lower-cased file extension (including the dot) for a document URI, or '' for none. */
function extensionOfUri(uri: string): string {
    let fsPath: string;
    try {
        fsPath = URI.parse(uri).fsPath;
    } catch {
        fsPath = uri;
    }
    return extname(fsPath).toLowerCase();
}

/** Returns the on-disk path for a `file:` document URI, or `undefined` for in-memory/untitled documents. */
function fsPathOfUri(uri: string): string | undefined {
    try {
        const parsed = URI.parse(uri);
        return parsed.scheme === 'file' ? parsed.fsPath : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Decide whether a document should be owned by the AssemblyScript service.
 *
 * A document is AssemblyScript when **any** of the following hold:
 *  - it uses the `assemblyscript` language ID, or
 *  - it has the `.as` extension, or
 *  - it is a `.ts` file that belongs to a project with a nearby `asconfig.json`.
 *
 * `.as` and AssemblyScript-flavored `.ts` are co-equal. For a `.ts` file that
 * belongs to an AssemblyScript project, AssemblyScript ownership wins so that
 * diagnostics are not produced by both engines.
 */
export function isAssemblyScriptDocument(doc: DocumentIdentity): boolean {
    if (doc.languageId === languageIds.assemblyscript) {
        return true;
    }

    const extension = extensionOfUri(doc.uri);
    if (extension === '.as') {
        return true;
    }

    if (extension === '.ts') {
        const fsPath = fsPathOfUri(doc.uri);
        if (fsPath && findNearestAsconfig(fsPath)) {
            return true;
        }
    }

    return false;
}
