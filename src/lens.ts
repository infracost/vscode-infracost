import { CodeLens, CodeLensProvider, Event, TextDocument } from 'vscode';
import Workspace from './workspace';
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
    const filename = document.uri.fsPath;
    logger.debug(`providing codelens for file ${filename}`);
    const blocks = this.workspace.project(filename);
    for (const block of Object.values(blocks)) {
      if (block.filename.toLowerCase() !== filename.toLowerCase()) {
        continue;
      }

      const cost = block.cost();

      let msg = `Total monthly cost: ${cost}`;
      if (this.workspace.loading) {
        msg = 'loading...';
      }

      const cmd = new InfracostCommand(msg, block);
      lenses.push(new CodeLens(block.lensPosition, cmd));
    }

    return lenses;
  }
}
