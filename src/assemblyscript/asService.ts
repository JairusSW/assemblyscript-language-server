/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { LspDocument } from '../document.js';
import type { LspClient } from '../lsp-client.js';
import type { Logger } from '../utils/logger.js';
import { PrefixingLogger } from '../utils/logger.js';
import type { LanguageService } from '../languageService.js';

/**
 * AssemblyScript-native analysis backend.
 *
 * Phase 0 scope: take ownership of AssemblyScript documents (so they are routed
 * away from `tsserver` and never double-analyzed) and track their contents in a
 * registry. No compiler analysis runs yet — parser diagnostics, project
 * discovery, and type facts are introduced in later phases. The document
 * registry established here is the foundation those phases build on.
 */
export class AssemblyScriptLanguageService implements LanguageService {
    public readonly id = 'assemblyscript' as const;

    private readonly logger: Logger;
    private readonly documents = new Map<string, LspDocument>();

    constructor(
        // Retained for the diagnostics/analysis work that lands in later phases.
        private readonly lspClient: LspClient,
        logger: Logger,
    ) {
        this.logger = new PrefixingLogger(logger, '[assemblyscript]');
    }

    private static key(uri: lsp.DocumentUri): string {
        try {
            return URI.parse(uri).toString();
        } catch {
            return uri;
        }
    }

    private static filepath(uri: lsp.DocumentUri): string {
        try {
            const parsed = URI.parse(uri);
            return parsed.scheme === 'file' ? parsed.fsPath : parsed.toString();
        } catch {
            return uri;
        }
    }

    public get documentsForTesting(): ReadonlyMap<string, LspDocument> {
        return this.documents;
    }

    hasDocument(uri: lsp.DocumentUri): boolean {
        return this.documents.has(AssemblyScriptLanguageService.key(uri));
    }

    openDocument(textDocument: lsp.TextDocumentItem): boolean {
        const key = AssemblyScriptLanguageService.key(textDocument.uri);
        if (this.documents.has(key)) {
            throw new Error(`Can't open already open document: ${textDocument.uri}`);
        }
        const document = new LspDocument(textDocument, AssemblyScriptLanguageService.filepath(textDocument.uri));
        this.documents.set(key, document);
        this.logger.log(`Opened AssemblyScript document ${textDocument.uri} (languageId: ${textDocument.languageId}).`);
        // TODO(phase 1): run the parser and publish AssemblyScript diagnostics.
        return true;
    }

    changeDocument(params: lsp.DidChangeTextDocumentParams): void {
        const { textDocument } = params;
        if (textDocument.version === null) {
            throw new Error(`Received document change event for ${textDocument.uri} without valid version identifier`);
        }
        const document = this.documents.get(AssemblyScriptLanguageService.key(textDocument.uri));
        if (!document) {
            return;
        }
        for (const change of params.contentChanges) {
            document.applyEdit(textDocument.version, change);
        }
        // TODO(phase 1): re-run the parser and refresh AssemblyScript diagnostics.
    }

    closeDocument(uri: lsp.DocumentUri): void {
        const key = AssemblyScriptLanguageService.key(uri);
        const document = this.documents.get(key);
        if (!document) {
            return;
        }
        this.documents.delete(key);
        // Clear any diagnostics this service published for the file.
        this.lspClient.publishDiagnostics({ uri: document.uri.toString(), diagnostics: [] });
    }
}
