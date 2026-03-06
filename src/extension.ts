import * as path from "path";
import { commands, env, Uri, window, workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import {
  ResourceViewProvider,
  ResourceDetailsResult,
} from "./resourceView";

let client: LanguageClient;
let resourceViewProvider: ResourceViewProvider;
let extensionPath: string;

function createClient(): LanguageClient {
  const config = workspace.getConfiguration("infracost");
  const defaultPath = path.join(extensionPath, "bin", "infracost-ls");
  const serverPath = config.get<string>("serverPath") || defaultPath;

  const serverEnv: Record<string, string> = { ...process.env } as Record<
    string,
    string
  >;
  const debugUI = config.get<string>("debugUI", "");
  if (debugUI) {
    serverEnv.INFRACOST_DEBUG_UI = debugUI;
  }

  const binDir = path.join(extensionPath, "bin");
  const plugins: Record<string, string> = {
    INFRACOST_CLI_PARSER_PLUGIN: "infracost-parser-plugin",
    INFRACOST_CLI_PROVIDER_PLUGIN_AWS: "infracost-provider-plugin-aws",
    INFRACOST_CLI_PROVIDER_PLUGIN_AZURERM: "infracost-provider-plugin-azurerm",
    INFRACOST_CLI_PROVIDER_PLUGIN_GOOGLE: "infracost-provider-plugin-google",
  };
  for (const [envVar, binary] of Object.entries(plugins)) {
    if (!serverEnv[envVar]) {
      serverEnv[envVar] = path.join(binDir, binary);
    }
  }

  const serverOptions: ServerOptions = {
    command: serverPath,
    transport: TransportKind.stdio,
    options: { env: serverEnv },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "terraform" },
      { scheme: "file", language: "yaml" },
      { scheme: "file", language: "json" },
    ],
    synchronize: {
      configurationSection: "infracost",
    },
  };

  return new LanguageClient(
    "infracost",
    "Infracost",
    serverOptions,
    clientOptions
  );
}

export function activate(context: ExtensionContext) {
  extensionPath = context.extensionPath;
  client = createClient();
  client.start().then(() => checkAuthStatus());

  resourceViewProvider = new ResourceViewProvider();
  context.subscriptions.push(
    window.registerWebviewViewProvider(
      ResourceViewProvider.viewType,
      resourceViewProvider
    )
  );

  // Move the sidebar view to the secondary sidebar on first install.
  const movedKey = "infracost.resourceDetailsMoved";
  if (!context.globalState.get<boolean>(movedKey)) {
    commands
      .executeCommand("vscode.moveViews", {
        viewIds: [ResourceViewProvider.viewType],
        destinationId: "workbench.view.extension.infracost-secondary",
      })
      .then(
        () => context.globalState.update(movedKey, true),
        () => {
          commands
            .executeCommand("workbench.action.moveView", {
              id: ResourceViewProvider.viewType,
              to: "auxiliarybar",
            })
            .then(
              () => context.globalState.update(movedKey, true),
              () => {}
            );
        }
      );
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    window.onDidChangeTextEditorSelection((e) => {
      if (!client || !isSupportedFile(e.textEditor.document.uri.fsPath)) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        const uri = e.textEditor.document.uri.toString();
        const line = e.selections[0].active.line;

        try {
          const result = await client.sendRequest<ResourceDetailsResult>(
            "infracost/resourceDetails",
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
    commands.registerCommand("infracost.revealResource", async (uri: string, line: number) => {
      if (!client) {
        return;
      }
      try {
        const result = await client.sendRequest<ResourceDetailsResult>(
          "infracost/resourceDetails",
          { uri, line }
        );
        resourceViewProvider.update(result);
        commands.executeCommand(`${ResourceViewProvider.viewType}.focus`);
      } catch {
        // Ignore errors
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("infracost.login", async () => {
      if (!client) {
        return;
      }
      try {
        const result = await client.sendRequest<{
          verificationUri: string;
          verificationUriComplete: string;
          userCode: string;
        }>("infracost/login");

        const choice = await window.showInformationMessage(
          `Enter code ${result.userCode} at ${result.verificationUri}`,
          "Open Browser",
          "Copy Code"
        );
        if (choice === "Open Browser") {
          await env.openExternal(Uri.parse(result.verificationUriComplete));
        } else if (choice === "Copy Code") {
          await env.clipboard.writeText(result.userCode);
          await env.openExternal(Uri.parse(result.verificationUriComplete));
        }
        // Clear the login view — the server will show "Scanning..." once auth completes.
        resourceViewProvider.update({ scanning: false });
      } catch (e) {
        window.showErrorMessage(`Infracost login failed: ${e}`);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("infracost.restartLsp", async () => {
      if (client) {
        await client.stop();
      }
      client = createClient();
      await client.start();
    })
  );
}

const cfnPatterns = ["template", "cloudformation", "cfn", "stack", "infracost"];

function isSupportedFile(fsPath: string): boolean {
  if (fsPath.endsWith(".tf")) {
    return true;
  }
  const base = fsPath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base.endsWith(".yml") || base.endsWith(".yaml") || base.endsWith(".json")) {
    return cfnPatterns.some((p) => base.includes(p));
  }
  return false;
}

async function checkAuthStatus() {
  if (!client) {
    return;
  }
  try {
    const result = await client.sendRequest<ResourceDetailsResult>(
      "infracost/resourceDetails",
      { uri: "", line: 0 }
    );
    if (result.needsLogin) {
      resourceViewProvider.showLogin();
    }
  } catch {
    // Ignore — server may not be ready yet
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
