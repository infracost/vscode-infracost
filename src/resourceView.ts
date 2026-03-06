import * as vscode from "vscode";
import { ResourceDetailsResult, renderResult, renderEmpty, renderLogin } from "./resourceHtml";

export { ResourceDetailsResult } from "./resourceHtml";

export class ResourceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "infracost.resourceDetails";

  private view?: vscode.WebviewView;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.view.webview.html = renderEmpty();

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "login") {
        vscode.commands.executeCommand("infracost.login");
      }
    });
  }

  update(data: ResourceDetailsResult): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = renderResult(data);
  }

  showLogin(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = renderLogin();
  }
}
