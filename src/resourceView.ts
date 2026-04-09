import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import {
  ResourceDetailsResult,
  FileSummaryResource,
  StatusInfo,
  renderResult,
  renderEmpty,
  renderLogin,
  renderLoginVerifying,
  renderTroubleshooting,
} from './resourceHtml';

export { ResourceDetailsResult } from './resourceHtml';

function isCopilotAvailable(): boolean {
  return vscode.extensions.getExtension('GitHub.copilot-chat') !== undefined;
}

export class ResourceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'infracost.resourceDetails';

  private view?: vscode.WebviewView;

  private pendingHtml?: string;

  private lastData?: ResourceDetailsResult;

  private client?: LanguageClient;

  setClient(c: LanguageClient): void {
    this.client = c;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true }; // eslint-disable-line no-param-reassign
    this.view.webview.html = this.pendingHtml ?? renderEmpty();
    this.pendingHtml = undefined;

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'login') {
        vscode.commands.executeCommand('infracost.login');
      }
      if (msg.command === 'viewLogs') {
        vscode.commands.executeCommand('infracost.showOutputChannel');
      }
      if (msg.command === 'back') {
        this.lastData = { scanning: false };
        this.fetchAndRenderEmpty(true);
      }
      if (msg.command === 'troubleshoot') {
        this.showTroubleshooting();
      }
      if (msg.command === 'restartLsp') {
        vscode.commands.executeCommand('infracost.restartLsp');
      }
      if (msg.command === 'generateBundle') {
        vscode.commands.executeCommand('infracost.generateBundle');
      }
      if (msg.command === 'revealResource') {
        const editor = vscode.window.activeTextEditor;
        const uri = editor ? editor.document.uri.toString() : '';
        vscode.commands.executeCommand('infracost.revealResource', uri, msg.line);
      }
      if (msg.command === 'fixWithCopilot') {
        vscode.commands.executeCommand('workbench.action.chat.open', {
          query: msg.prompt,
          isPartialQuery: false,
        });
      }
    });
  }

  update(data: ResourceDetailsResult): void {
    this.lastData = data;
    if (!data.resource && !data.needsLogin && !data.scanning) {
      this.fetchAndRenderEmpty(!data.needsLogin);
      return;
    }
    this.setHtml(renderResult(data, isCopilotAvailable()));
  }

  showLogin(): void {
    this.lastData = undefined;
    this.setHtml(renderLogin());
  }

  showLoginVerifying(userCode: string): void {
    this.setHtml(renderLoginVerifying(userCode));
  }

  refreshEmpty(): void {
    if (
      this.lastData &&
      !this.lastData.resource &&
      !this.lastData.needsLogin &&
      !this.lastData.scanning
    ) {
      this.fetchAndRenderEmpty(true);
    }
  }

  private showTroubleshooting(): void {
    if (!this.client) {
      this.setHtml(
        renderTroubleshooting({
          version: 'unknown',
          workspaceRoot: '',
          loggedIn: false,
          scanning: false,
          projectCount: 0,
          projectNames: [],
          resourceCount: 0,
          violationCount: 0,
          tagIssueCount: 0,
          configFound: false,
        })
      );
      return;
    }

    this.client
      .sendRequest<StatusInfo>('infracost/status')
      .then((status) => {
        this.setHtml(renderTroubleshooting(status));
      })
      .catch(() => {
        this.setHtml(
          renderTroubleshooting({
            version: 'error fetching status',
            workspaceRoot: '',
            loggedIn: false,
            scanning: false,
            projectCount: 0,
            projectNames: [],
            resourceCount: 0,
            violationCount: 0,
            tagIssueCount: 0,
            configFound: false,
          })
        );
      });
  }

  private fetchAndRenderEmpty(loggedIn: boolean): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.client) {
      this.setHtml(renderEmpty(loggedIn));
      return;
    }

    const uri = editor.document.uri.toString();
    this.client
      .sendRequest<{ resources: FileSummaryResource[] }>('infracost/fileSummary', { uri })
      .then((result) => {
        const resources =
          result.resources && result.resources.length > 0 ? result.resources : undefined;
        this.setHtml(renderEmpty(loggedIn, resources));
      })
      .catch(() => {
        this.setHtml(renderEmpty(loggedIn));
      });
  }

  private setHtml(html: string): void {
    if (this.view) {
      this.view.webview.html = html;
    } else {
      this.pendingHtml = html;
    }
  }
}
