import * as vscode from 'vscode';
import { ResourceDetailsResult, renderResult, renderEmpty, renderLogin } from './resourceHtml';

export { ResourceDetailsResult } from './resourceHtml';

function isCopilotAvailable(): boolean {
  return vscode.extensions.getExtension('GitHub.copilot-chat') !== undefined;
}

export class ResourceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'infracost.resourceDetails';

  private view?: vscode.WebviewView;

  private pendingHtml?: string;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true }; // eslint-disable-line no-param-reassign
    this.view.webview.html = this.pendingHtml ?? renderEmpty();
    this.pendingHtml = undefined;

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'login') {
        vscode.commands.executeCommand('infracost.login');
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
    this.setHtml(renderResult(data, isCopilotAvailable()));
  }

  showLogin(): void {
    this.setHtml(renderLogin());
  }

  private setHtml(html: string): void {
    if (this.view) {
      this.view.webview.html = html;
    } else {
      this.pendingHtml = html;
    }
  }
}
