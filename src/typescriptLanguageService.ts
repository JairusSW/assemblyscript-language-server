/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import type { TsClient } from './ts-client.js';
import type { DiagnosticsManager } from './diagnosticsManager.js';
import type FileConfigurationManager from './features/fileConfigurationManager.js';
import type { CachedResponse } from './tsServer/cachedResponse.js';
import { type ts } from './ts-protocol.js';
import type { LanguageService } from './languageService.js';

export interface TypeScriptLanguageServiceDependencies {
    tsClient: TsClient;
    fileConfigurationManager: FileConfigurationManager;
    diagnosticsManager: DiagnosticsManager;
    cachedNavTreeResponse: CachedResponse<ts.server.protocol.NavTreeResponse>;
}

/**
 * Legacy TypeScript/JavaScript backend. A thin adapter over the existing
 * `tsserver`-based pipeline, exposed through the engine-neutral
 * {@link LanguageService} contract so the router can own document routing.
 *
 * This wraps the document lifecycle only; feature requests (hover, completion,
 * …) are still served directly by `LspServer` against `TsClient` for now and
 * move behind this contract as they are migrated.
 */
export class TypeScriptLanguageService implements LanguageService {
    public readonly id = 'typescript' as const;

    private readonly tsClient: TsClient;
    private readonly fileConfigurationManager: FileConfigurationManager;
    private readonly diagnosticsManager: DiagnosticsManager;
    private readonly cachedNavTreeResponse: CachedResponse<ts.server.protocol.NavTreeResponse>;

    constructor(deps: TypeScriptLanguageServiceDependencies) {
        this.tsClient = deps.tsClient;
        this.fileConfigurationManager = deps.fileConfigurationManager;
        this.diagnosticsManager = deps.diagnosticsManager;
        this.cachedNavTreeResponse = deps.cachedNavTreeResponse;
    }

    hasDocument(uri: lsp.DocumentUri): boolean {
        return Boolean(this.tsClient.toOpenDocument(uri, { suppressAlertOnFailure: true }));
    }

    openDocument(textDocument: lsp.TextDocumentItem): boolean {
        if (this.tsClient.toOpenDocument(textDocument.uri, { suppressAlertOnFailure: true })) {
            throw new Error(`Can't open already open document: ${textDocument.uri}`);
        }

        if (!this.tsClient.openTextDocument(textDocument)) {
            return false;
        }

        const document = this.tsClient.toOpenDocument(textDocument.uri);
        if (document) {
            this.fileConfigurationManager.onDidOpenTextDocument(document);
        }
        return true;
    }

    changeDocument(params: lsp.DidChangeTextDocumentParams): void {
        if (this.fileConfigurationManager.workspaceConfiguration.diagnostics?.eagerClear) {
            const document = this.tsClient.toOpenDocument(params.textDocument.uri);
            if (document) {
                this.diagnosticsManager.clearDiagnosticsForFile(document.filepath);
            }
        }
        this.tsClient.onDidChangeTextDocument(params);
    }

    closeDocument(uri: lsp.DocumentUri): void {
        const document = this.tsClient.toOpenDocument(uri);
        if (!document) {
            throw new Error(`Trying to close not opened document: ${uri}`);
        }
        this.cachedNavTreeResponse.onDocumentClose(document);
        this.tsClient.onDidCloseTextDocument(uri);
        this.diagnosticsManager.onDidCloseFile(document.filepath);
        this.fileConfigurationManager.onDidCloseTextDocument(document.uri);
    }
}
