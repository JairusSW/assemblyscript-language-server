/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import type { DiagnosticMessage } from 'assemblyscript';
import type { LspDocument } from '../document.js';
import type { ProjectConfigDiagnostic } from './asProjectService.js';

/** The `source` attached to diagnostics produced by AssemblyScript analysis. */
export const ASSEMBLYSCRIPT_DIAGNOSTIC_SOURCE = 'assemblyscript';

/**
 * AssemblyScript's `DiagnosticCategory` (a const enum we avoid importing at
 * runtime to keep it bundler-safe): `Pedantic = 0`, `Info = 1`, `Warning = 2`,
 * `Error = 3`.
 */
function toLspSeverity(category: number): lsp.DiagnosticSeverity {
    switch (category) {
        case 3: return lsp.DiagnosticSeverity.Error;
        case 2: return lsp.DiagnosticSeverity.Warning;
        case 1: return lsp.DiagnosticSeverity.Information;
        case 0:
        default: return lsp.DiagnosticSeverity.Hint;
    }
}

/**
 * Convert an AssemblyScript compiler range (start/end offsets into the source
 * text) into an LSP range using the document's own offset→position mapping.
 * Falls back to the start of the file when the diagnostic carries no range.
 */
function toLspRange(message: DiagnosticMessage, document: LspDocument): lsp.Range {
    const range = message.range;
    if (!range) {
        const start = lsp.Position.create(0, 0);
        return lsp.Range.create(start, start);
    }
    return lsp.Range.create(
        document.positionAt(range.start),
        document.positionAt(range.end),
    );
}

/** Translate a single AssemblyScript diagnostic into an LSP diagnostic. */
export function toLspDiagnostic(message: DiagnosticMessage, document: LspDocument): lsp.Diagnostic {
    const diagnostic: lsp.Diagnostic = {
        range: toLspRange(message, document),
        message: message.message,
        severity: toLspSeverity(message.category),
        code: message.code,
        source: ASSEMBLYSCRIPT_DIAGNOSTIC_SOURCE,
    };

    if (message.relatedRange) {
        diagnostic.relatedInformation = [{
            location: {
                uri: document.uri.toString(),
                range: lsp.Range.create(
                    document.positionAt(message.relatedRange.start),
                    document.positionAt(message.relatedRange.end),
                ),
            },
            message: message.message,
        }];
    }

    return diagnostic;
}

/** Translate a list of AssemblyScript diagnostics for a single document. */
export function toLspDiagnostics(messages: readonly DiagnosticMessage[], document: LspDocument): lsp.Diagnostic[] {
    return messages.map(message => toLspDiagnostic(message, document));
}

/**
 * Translate an `asconfig.json` resolution problem into an LSP diagnostic. The
 * problem is anchored at the start of the config file (precise JSON positions
 * arrive when config parsing tracks offsets).
 */
export function toLspConfigDiagnostic(diagnostic: ProjectConfigDiagnostic): lsp.Diagnostic {
    const start = lsp.Position.create(0, 0);
    return {
        range: lsp.Range.create(start, start),
        message: diagnostic.message,
        severity: diagnostic.severity === 'error' ? lsp.DiagnosticSeverity.Error : lsp.DiagnosticSeverity.Warning,
        source: ASSEMBLYSCRIPT_DIAGNOSTIC_SOURCE,
    };
}
