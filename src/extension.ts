import * as path from 'path';
import { commands, EventEmitter, ExtensionContext, languages, window, workspace } from 'vscode';
import InfracostLensProvider from './lens';
import infracostStatus from './statusBar';
import webviews from './webview';
import Workspace from './workspace';
import compileTemplates from './template';
import InfracostProjectProvider, { InfracostTreeItem } from './tree';
import context from './context';
import CLI from './cli';

export async function activate(ctx: ExtensionContext) {
  const cli = new CLI(path.join(ctx.extensionPath, 'bin', 'infracost'));
  await context.init(cli);
  webviews.init();
  infracostStatus.subscribeContext(ctx);
  infracostStatus.setLoading();

  const template = await compileTemplates(ctx);

  const folders = workspace.workspaceFolders;
  if (!folders || folders?.length === 0) {
    return;
  }

  const root = folders[0].uri.fsPath.toString();

  const treeEmitter = new EventEmitter<InfracostTreeItem | undefined | void>();

  const out = await cli.exec(['configure', 'get', 'currency']);
  let currency = out.stdout.trim();
  if (currency === '') {
    currency = 'USD';
  }

  const w = new Workspace(root, cli, template, treeEmitter, currency);

  const projectProvider = new InfracostProjectProvider(w, treeEmitter);
  commands.registerCommand('infracost.refresh', () => projectProvider.refresh());
  commands.registerCommand('infracost.login', () => w.login());
  window.registerTreeDataProvider('infracostProjects', projectProvider);
  await w.init();

  commands.registerCommand('infracost.resourceBreakdown', Workspace.show.bind(w));

  languages.registerCodeLensProvider(
    [{ scheme: 'file', pattern: '**/*.tf' }],
    new InfracostLensProvider(w)
  );
  workspace.onDidSaveTextDocument(w.fileChange.bind(w));
  infracostStatus.setReady();
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
