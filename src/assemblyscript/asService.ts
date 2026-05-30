/*
 * Copyright (C) 2026 Jairus and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { Parser } from 'assemblyscript';
import { LspDocument } from '../document.js';
import type { LspClient } from '../lsp-client.js';
import type { Logger } from '../utils/logger.js';
import { PrefixingLogger } from '../utils/logger.js';
import type { LanguageService } from '../languageService.js';
import { toLspDiagnostics, toLspConfigDiagnostic } from './diagnostics.js';
import { AsProjectService } from './asProjectService.js';

/**
 * AssemblyScript-native analysis backend.
 *
 * Tracks open AssemblyScript documents (so they are routed away from `tsserver`
 * and never double-analyzed) and publishes syntax diagnostics from the
 * AssemblyScript parser. Project discovery (`asconfig.json`), full semantic
 * analysis, and type facts are introduced in later phases; this service is the
 * foundation they build on.
 */
export class AssemblyScriptLanguageService implements LanguageService {
    public readonly id = 'assemblyscript' as const;

    private readonly logger: Logger;
    private readonly documents = new Map<string, LspDocument>();
    private readonly projectService: AsProjectService;

    constructor(
        // Retained for the diagnostics/analysis work that lands in later phases.
        private readonly lspClient: LspClient,
        logger: Logger,
        projectService: AsProjectService = new AsProjectService(),
    ) {
        this.logger = new PrefixingLogger(logger, '[assemblyscript]');
        this.projectService = projectService;
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
        this.validate(document);
        this.validateProject(document);
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
        this.validate(document);
        this.validateProject(document);
    }

    /**
     * Parse the document with the AssemblyScript parser and publish the
     * resulting syntax diagnostics. Parsing is single-file and fault-tolerant;
     * project-wide semantic diagnostics arrive with the compile service in a
     * later phase.
     *
     * TODO(phase 2): debounce + single-flight once the (expensive) full compile
     * runs here; the parser alone is cheap enough to run synchronously.
     */
    private validate(document: LspDocument): void {
        const parser = new Parser();
        parser.parseFile(document.getText(), AssemblyScriptLanguageService.parsePath(document), true);
        const diagnostics = toLspDiagnostics(parser.diagnostics, document);
        this.lspClient.publishDiagnostics({ uri: document.uri.toString(), diagnostics });
    }

    /** A forward-slash-normalized path for the AssemblyScript parser/source. */
    private static parsePath(document: LspDocument): string {
        return document.filepath.replace(/\\/g, '/');
    }

    /**
     * Resolve the document's `asconfig.json` project and publish any config
     * problems against the config file. Publishing an empty list clears stale
     * problems once the config is fixed.
     *
     * TODO(step 7): invalidate the project cache from `asconfig.json` watch
     * events so config edits refresh without reopening a member document.
     */
    private validateProject(document: LspDocument): void {
        const project = this.projectService.resolveProjectForFile(document.filepath);
        if (!project) {
            return;
        }
        const uri = URI.file(project.configPath).toString();
        this.lspClient.publishDiagnostics({
            uri,
            diagnostics: project.diagnostics.map(toLspConfigDiagnostic),
        });
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
