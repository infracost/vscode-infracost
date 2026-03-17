import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { Trace } from 'vscode-languageserver-protocol';
import { ResourceViewProvider, ResourceDetailsResult } from './resourceView';

let client: LanguageClient | undefined;
let resourceViewProvider: ResourceViewProvider;
let extensionPath: string;

function createClient(): LanguageClient {
  const config = vscode.workspace.getConfiguration('infracost');
  const defaultPath = path.join(extensionPath, 'bin', 'infracost-ls');
  const serverPath = config.get<string>('serverPath') || defaultPath;

  const serverEnv: Record<string, string> = { ...process.env } as Record<string, string>;
  const debug = config.get<boolean>('debug', false);
  if (debug) {
    const debugUI = config.get<string>('debugUI', '');
    if (debugUI) {
      serverEnv.INFRACOST_DEBUG_UI = debugUI;
    }
  }

  const serverOptions: ServerOptions = {
    command: serverPath,
    transport: TransportKind.stdio,
    options: { env: serverEnv },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'terraform' },
      { scheme: 'file', language: 'yaml' },
      { scheme: 'file', language: 'json' },
    ],
    synchronize: {
      configurationSection: 'infracost',
    },
    initializationOptions: {
      clientName: 'vscode',
      extensionVersion:
        vscode.extensions.getExtension('Infracost.infracost')?.packageJSON?.version ?? 'unknown',
    },
  };

  return new LanguageClient('infracost', 'Infracost', serverOptions, clientOptions);
}

export function activate(context: vscode.ExtensionContext) {
  extensionPath = context.extensionPath;
  client = createClient();

  const debug = vscode.workspace.getConfiguration('infracost').get<boolean>('debug', false);

  client
    .start()
    .then(async () => {
      if (!debug) {
        await client?.setTrace(Trace.Off);
      }
      checkAuthStatus();
    })
    .catch((error) => {
      vscode.window.showErrorMessage(`Failed to start Infracost language server: ${error}`);
    });

  resourceViewProvider = new ResourceViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ResourceViewProvider.viewType, resourceViewProvider)
  );

  // Move the sidebar view to the secondary sidebar on first install.
  const movedKey = 'infracost.resourceDetailsMoved';
  if (!context.globalState.get<boolean>(movedKey)) {
    vscode.commands
      .executeCommand('vscode.moveViews', {
        viewIds: [ResourceViewProvider.viewType],
        destinationId: 'workbench.view.extension.infracost-secondary',
      })
      .then(
        () => context.globalState.update(movedKey, true),
        () => {
          vscode.commands
            .executeCommand('workbench.action.moveView', {
              id: ResourceViewProvider.viewType,
              to: 'auxiliarybar',
            })
            .then(
              () => context.globalState.update(movedKey, true),
              () => {
                // Ignore error if commands fail
              }
            );
        }
      );
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
      if (!client || !isSupportedFile(e.textEditor.document.uri.fsPath)) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        if (!client) {
          return;
        }

        const uri = e.textEditor.document.uri.toString();
        const { line } = e.selections[0].active;

        try {
          const result = await client.sendRequest<ResourceDetailsResult>(
            'infracost/resourceDetails',
            { uri, line }
          );
          resourceViewProvider.update(result);
        } catch {
          // Ignore errors (e.g. server not ready)
        }
      }, 150);
    })
  );

  // Triggered by code lens clicks — fetches resource details and reveals the sidebar.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'infracost.revealResource',
      async (uri: string, line: number) => {
        if (!client) {
          return;
        }
        try {
          const result = await client.sendRequest<ResourceDetailsResult>(
            'infracost/resourceDetails',
            { uri, line }
          );
          resourceViewProvider.update(result);
          vscode.commands.executeCommand(`${ResourceViewProvider.viewType}.focus`);
        } catch {
          // Ignore errors
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.login', async () => {
      if (!client) {
        return;
      }
      try {
        const result = await client.sendRequest<{
          verificationUri: string;
          verificationUriComplete: string;
          userCode: string;
        }>('infracost/login');

        const choice = await vscode.window.showInformationMessage(
          `Enter code ${result.userCode} at ${result.verificationUri}`,
          'Open Browser',
          'Copy Code'
        );
        if (choice === 'Open Browser') {
          await vscode.env.openExternal(vscode.Uri.parse(result.verificationUriComplete));
        } else if (choice === 'Copy Code') {
          await vscode.env.clipboard.writeText(result.userCode);
          await vscode.env.openExternal(vscode.Uri.parse(result.verificationUriComplete));
        }
        // Clear the login view — the server will show "Scanning..." once auth completes.
        resourceViewProvider.update({ scanning: false });
      } catch (e) {
        vscode.window.showErrorMessage(`Infracost login failed: ${e}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.restartLsp', async () => {
      if (client && client.isRunning()) {
        try {
          await client.stop();
        } catch {
          // Ignore errors during stop
        }
      }
      client = createClient();
      await client.start();
    })
  );
}

const cfnPatterns = ['template', 'cloudformation', 'cfn', 'stack', 'infracost'];

function isSupportedFile(fsPath: string): boolean {
  if (fsPath.endsWith('.tf')) {
    return true;
  }
  const base = fsPath.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (base.endsWith('.yml') || base.endsWith('.yaml') || base.endsWith('.json')) {
    return cfnPatterns.some((p) => base.includes(p));
  }
  return false;
}

async function checkAuthStatus() {
  if (!client) {
    return;
  }
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 5000);
    });

    const requestPromise = client.sendRequest<ResourceDetailsResult>('infracost/resourceDetails', {
      uri: '',
      line: 0,
    });

    const result = await Promise.race([requestPromise, timeoutPromise]);

    if (result.needsLogin) {
      resourceViewProvider.showLogin();
    } else if (!result.scanning) {
      // If not scanning and not needing login, show empty state
      resourceViewProvider.update({ scanning: false });
    }
  } catch (error) {
    // If auth check fails, show empty state instead of staying in scanning
    resourceViewProvider.update({ scanning: false });
  }
}

export async function deactivate(): Promise<void> {
  if (!client) {
    return;
  }
  await client.dispose();
  client = undefined;
}
