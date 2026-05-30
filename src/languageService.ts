/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { isAssemblyScriptDocument, type DocumentIdentity } from './assemblyscript/documentSelector.js';

export type LanguageServiceId = 'typescript' | 'assemblyscript';

/**
 * Engine-neutral contract that each analysis backend implements. The router
 * dispatches document-lifecycle events to the owning service. Feature methods
 * (hover, completion, diagnostics, …) are added to this contract as they are
 * migrated to AssemblyScript-native analysis in later phases.
 */
export interface LanguageService {
    readonly id: LanguageServiceId;

    /** Whether this service currently has the given document open. */
    hasDocument(uri: lsp.DocumentUri): boolean;

    /**
     * Open a document. Returns `true` if the service took ownership, `false` if
     * it cannot handle the document (e.g. unsupported language). Implementations
     * may throw if the document is already open (an internal invariant).
     */
    openDocument(textDocument: lsp.TextDocumentItem): boolean;

    /** Apply an incremental change to an open document. */
    changeDocument(params: lsp.DidChangeTextDocumentParams): void;

    /** Close an open document. */
    closeDocument(uri: lsp.DocumentUri): void;
}

/**
 * Routes documents to the owning {@link LanguageService}. For an open request,
 * ownership is decided by {@link isAssemblyScriptDocument}. For subsequent
 * change/close requests (where only a URI is available) the service that
 * already holds the document is preferred, so routing stays consistent even
 * when identity can't be recomputed from the URI alone.
 */
export class LanguageServiceRouter {
    constructor(
        private readonly assemblyscript: LanguageService,
        private readonly typescript: LanguageService,
    ) {}

    /** Pick the owning service for an opening document, by identity. */
    serviceForOpen(doc: DocumentIdentity): LanguageService {
        return isAssemblyScriptDocument(doc) ? this.assemblyscript : this.typescript;
    }

    /** Pick the owning service for an already-open document, preferring the current owner. */
    serviceForUri(uri: lsp.DocumentUri): LanguageService {
        if (this.assemblyscript.hasDocument(uri)) {
            return this.assemblyscript;
        }
        if (this.typescript.hasDocument(uri)) {
            return this.typescript;
        }
        return this.serviceForOpen({ uri });
    }
}
