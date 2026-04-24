import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { Trace } from 'vscode-languageserver-protocol';
import { ResourceViewProvider, ResourceDetailsResult, OrgInfo } from './resourceView';
import { StatusInfo } from './resourceHtml';

let client: LanguageClient | undefined;
let resourceViewProvider: ResourceViewProvider;
let extensionPath: string;
let pendingLogin: { uri: string; userCode: string } | undefined;
let hasShownOrgSelector = false;

function resolveServerPath(extensionPath: string): string {
  const binaryName = os.platform() === 'win32' ? 'infracost-ls.exe' : 'infracost-ls';
  const bundledPath = path.join(extensionPath, 'bin', binaryName);
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }
  return binaryName;
}

function createClient(): LanguageClient {
  const config = vscode.workspace.getConfiguration('infracost');
  const serverPath = config.get<string>('serverPath') || resolveServerPath(extensionPath);

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

  client
    .start()
    .then(async () => {
      if (client) {
        await setupClient(client);
      }
    })
    .catch((error) => {
      client = undefined;
      vscode.window.showErrorMessage(`Failed to start Infracost language server: ${error}`);
    });

  resourceViewProvider = new ResourceViewProvider(context.extensionUri);
  resourceViewProvider.setClient(client);
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

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        resourceViewProvider.update({ scanning: false });
      }
    })
  );

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
          // Capture editor before focus shifts to the webview panel.
          const editor = vscode.window.activeTextEditor;

          const result = await client.sendRequest<ResourceDetailsResult>(
            'infracost/resourceDetails',
            { uri, line }
          );
          resourceViewProvider.update(result);
          vscode.commands.executeCommand(`${ResourceViewProvider.viewType}.focus`);

          if (editor && editor.document.uri.toString() === uri) {
            const pos = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(
              new vscode.Range(pos, pos),
              vscode.TextEditorRevealType.InCenterIfOutsideViewport
            );
          }
        } catch {
          // Ignore errors
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.login', async () => {
      if (!client) {
        vscode.window.showErrorMessage(
          'Infracost language server is not running. Try restarting it first.'
        );
        return;
      }

      if (pendingLogin) {
        resourceViewProvider.showLoginVerifying(pendingLogin.userCode);
        await vscode.env.openExternal(vscode.Uri.parse(pendingLogin.uri));
        return;
      }

      try {
        const result = await client.sendRequest<{
          verificationUri: string;
          verificationUriComplete: string;
          userCode: string;
        }>('infracost/login');

        pendingLogin = { uri: result.verificationUriComplete, userCode: result.userCode };
        resourceViewProvider.showLoginVerifying(result.userCode);
        await vscode.env.openExternal(vscode.Uri.parse(result.verificationUriComplete));
        // Keep showing login — scanComplete will refresh the view once auth succeeds.
      } catch (e) {
        pendingLogin = undefined;
        vscode.window.showErrorMessage(`Infracost login failed: ${e}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.showOutputChannel', () => {
      client?.outputChannel.show(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.selectOrg', () => {
      resourceViewProvider.handleSelectOrg();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.logout', async () => {
      if (!client) {
        vscode.window.showErrorMessage('Infracost language server is not running.');
        return;
      }
      try {
        await client.sendRequest('infracost/logout');
      } catch (e) {
        vscode.window.showErrorMessage(`Infracost logout failed: ${e}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.generateBundle', async () => {
      try {
        const status = client
          ? await client.sendRequest<StatusInfo>('infracost/status')
          : { error: 'Language server not running' };

        const config = vscode.workspace.getConfiguration('infracost');
        const lspPath = config.get<string>('serverPath') || resolveServerPath(extensionPath);

        const bundle = {
          timestamp: new Date().toISOString(),
          vscodeVersion: vscode.version,
          extensionVersion:
            vscode.extensions.getExtension('Infracost.infracost')?.packageJSON?.version ??
            'unknown',
          platform: process.platform,
          arch: process.arch,
          lspPath,
          status,
        };

        const bundlePath = path.join(os.tmpdir(), `infracost-support-${Date.now()}.json`);
        fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

        const doc = await vscode.workspace.openTextDocument(bundlePath);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`Support bundle saved to ${bundlePath}`);
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to generate support bundle: ${e}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.restartClient', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Restarting Infracost client...',
        },
        async () => {
          if (client) {
            await client.restart();
            await setupClient(client);
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infracost.restartLsp', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Restarting Infracost Language Server...',
        },
        async () => {
          if (client) {
            try {
              await client.dispose();
            } catch {
              // Ignore dispose errors
            }
          }
          pendingLogin = undefined;
          client = createClient();
          resourceViewProvider.setClient(client);
          await client.start();
          await setupClient(client);
        }
      );
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

async function setupClient(c: LanguageClient): Promise<void> {
  resourceViewProvider.setGuardrails([]);
  const trace = vscode.workspace.getConfiguration('infracost').get<string>('trace.server', 'off');
  await c.setTrace(Trace.fromString(trace));
  c.onNotification('infracost/updateAvailable', handleUpdateAvailable);
  c.onNotification('infracost/scanComplete', handleScanComplete);
  c.onNotification('infracost/loginComplete', () => {
    pendingLogin = undefined;
    hasShownOrgSelector = false;
    resourceViewProvider.update({ scanning: true });
  });
  c.onNotification('infracost/logoutComplete', () => {
    resourceViewProvider.showLogin();
  });
  await checkAuthStatus();
  c.sendRequest<OrgInfo>('infracost/orgs')
    .then((info) => resourceViewProvider.setOrgInfo(info))
    .catch((err) => c.outputChannel.appendLine(`infracost/orgs: ${err}`));
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

async function handleScanComplete() {
  if (!client) {
    return;
  }

  // Refresh org info after each scan — user.json is populated by this point.
  try {
    const info = await client.sendRequest<OrgInfo>('infracost/orgs');
    resourceViewProvider.setOrgInfo(info);
    if (!hasShownOrgSelector && info.organizations.length > 1 && !info.hasExplicitSelection) {
      hasShownOrgSelector = true;
      resourceViewProvider.handleSelectOrg();
    }
  } catch (e) {
    vscode.window.showWarningMessage('Infracost: failed to fetch org info');
  }

  // Prefer the active editor, but fall back to any visible editor showing a
  // supported file (e.g. when Copilot Chat has focus after a fix).
  let editor = vscode.window.activeTextEditor;
  if (!editor || !isSupportedFile(editor.document.uri.fsPath)) {
    editor = vscode.window.visibleTextEditors.find((e) => isSupportedFile(e.document.uri.fsPath));
  }
  try {
    const statusPromise = client.sendRequest<StatusInfo>('infracost/status');

    if (!editor) {
      const statusOutcome = await statusPromise.catch(() => null);
      if (statusOutcome) {
        resourceViewProvider.setGuardrails(statusOutcome.triggeredGuardrails ?? []);
      }
      resourceViewProvider.update({ scanning: false });
      return;
    }

    const uri = editor.document.uri.toString();
    const { line } = editor.selection.active;
    const [detailsOutcome, statusOutcome] = await Promise.allSettled([
      client.sendRequest<ResourceDetailsResult>('infracost/resourceDetails', { uri, line }),
      statusPromise,
    ]);
    if (statusOutcome.status === 'fulfilled') {
      resourceViewProvider.setGuardrails(statusOutcome.value.triggeredGuardrails ?? []);
    }
    if (detailsOutcome.status === 'fulfilled') {
      resourceViewProvider.update(detailsOutcome.value);
    }
  } catch {
    // Ignore errors
  }
}

async function handleUpdateAvailable(params: {
  updateAvailable: boolean;
  latestVersion: string;
  currentVersion: string;
}) {
  if (!params.updateAvailable) {
    return;
  }

  const semver = /^\d+\.\d+\.\d+$/;
  if (
    !semver.test(params.currentVersion) ||
    !semver.test(params.latestVersion) ||
    params.currentVersion === '0.0.0'
  ) {
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `Infracost Language Server update available: v${params.currentVersion} → v${params.latestVersion}`,
    'Update'
  );
  if (choice !== 'Update' || !client) {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Updating Infracost Language Server...',
      },
      async () => {
        await client?.sendRequest('infracost/update');
      }
    );
    await vscode.commands.executeCommand('infracost.restartLsp');
    vscode.window.showInformationMessage(
      `Infracost Language Server updated to v${params.latestVersion}.`
    );
  } catch (e) {
    vscode.window.showErrorMessage(`Infracost update failed: ${e}`);
  }
}

export async function deactivate(): Promise<void> {
  if (!client) {
    return;
  }
  await client.dispose();
  client = undefined;
}
