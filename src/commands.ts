/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { SourceDefinitionCommand } from './features/source-definition.js';
import type { TypeScriptVersionSource } from './tsServer/versionProvider.js';

export const Commands = {
    APPLY_REFACTORING: '_assemblyscript.applyRefactoring',
    CONFIGURE_PLUGIN: '_assemblyscript.configurePlugin',
    ORGANIZE_IMPORTS: '_assemblyscript.organizeImports',
    APPLY_RENAME_FILE: '_assemblyscript.applyRenameFile',
    APPLY_COMPLETION_CODE_ACTION: '_assemblyscript.applyCompletionCodeAction',
    /** Commands below should be implemented by the client */
    SELECT_REFACTORING: '_assemblyscript.selectRefactoring',
    SOURCE_DEFINITION: SourceDefinitionCommand.id,
};

type LanguageServerVersionNotificationParams = {
    version: string;
    source: TypeScriptVersionSource;
};

// Reports the version of the underlying analysis engine. While the TypeScript
// fallback (tsserver) is the only engine, this carries the TypeScript version.
export const LanguageServerVersionNotification = new lsp.NotificationType<LanguageServerVersionNotificationParams>('$/assemblyscriptVersion');

