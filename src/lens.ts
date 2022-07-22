import {
  CodeLensProvider,
  Event,
  TextDocument,
  CodeLens,
  commands,
  SymbolInformation,
  Position,
  DocumentSymbol,
} from 'vscode';
import Workspace from './workspace';
import { cleanFilename } from './utils';
import logger from './log';
import { InfracostCommand } from './command';
import context from './context';

export default class InfracostLensProvider implements CodeLensProvider {
  workspace: Workspace;

  onDidChangeCodeLenses: Event<void>;

  constructor(workspace: Workspace) {
    this.workspace = workspace;
    this.onDidChangeCodeLenses = workspace.codeLensEventEmitter.event;
  }

  async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    if (!context.isLoggedIn()) {
      return [];
    }

    const lenses: CodeLens[] = [];
    const filename = cleanFilename(document.uri.path);
    logger.debug(`providing codelens for file ${filename}`);

    const blocks = this.workspace.project(filename);

    const symbols = await commands.executeCommand<SymbolInformation[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );
    if (symbols === undefined) {
      logger.debug(`no valid symbols found for file ${filename}`);
      return lenses;
    }

    for (const sym of symbols) {
      logger.debug(`evaluating symbol: ${sym.name}`);

      if (sym.name.indexOf('resource') === -1 && sym.name.indexOf('module') === -1) {
        logger.debug(`skipping symbol as not supported for Infracost costs`);
        continue;
      }

      const line = document.lineAt(getRangeFromSymbol(sym).start);
      const resourceKey = sym.name
        .replace(/\s+/g, '.')
        .replace(/"/g, '')
        .replace(/^resource\./g, '');

      logger.debug(`finding symbol cost using key: ${resourceKey}`);

      if (blocks[resourceKey] !== undefined) {
        const block = blocks[resourceKey];
        const cost = block.cost();
        logger.debug(`found Infracost price for symbol: ${resourceKey} cost: ${cost}`);

        let msg = `Total monthly cost: ${cost}`;
        if (this.workspace.loading) {
          msg = 'loading...';
        }

        const cmd = new InfracostCommand(msg, block);
        lenses.push(new CodeLens(line.range.with(new Position(line.range.start.line, 0)), cmd));
        continue;
      }

      logger.debug(`no registered blocks matching key: ${resourceKey}`);
    }

    return lenses;
  }
}

function getRangeFromSymbol(symbol: DocumentSymbol | SymbolInformation) {
  return isDocumentSymbol(symbol) ? symbol.range : symbol.location.range;
}

function isDocumentSymbol(symbol: DocumentSymbol | SymbolInformation): symbol is DocumentSymbol {
  return is<DocumentSymbol>(symbol, 'children');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function is<T extends object>(o: T | null | undefined): o is T;
function is<T extends object>(o: object, prop: keyof T, value?: any): o is T;
function is<T extends object>(o: object, matcher: (o: object) => boolean): o is T;
function is<T extends object>(
  o: object,
  propOrMatcher?: keyof T | ((o: any) => boolean),
  value?: any
): o is T {
  if (propOrMatcher == null) return o != null;
  if (typeof propOrMatcher === 'function') return propOrMatcher(o);

  return value === undefined
    ? (o as any)[propOrMatcher] !== undefined
    : (o as any)[propOrMatcher] === value;
}
