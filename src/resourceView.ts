import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import {
  ResourceDetailsResult,
  OrgInfo,
  StatusInfo,
  GuardrailStatus,
  RenderOptions,
  WorkspaceSummaryResult,
  renderResult,
  renderEmpty,
  renderLogin,
  renderLoginVerifying,
  renderTroubleshooting,
} from './resourceHtml';

export { ResourceDetailsResult, OrgInfo, GuardrailStatus } from './resourceHtml';

function isCopilotAvailable(): boolean {
  return vscode.extensions.getExtension('GitHub.copilot-chat') !== undefined;
}

const DEFAULT_STATUS: StatusInfo = {
  version: '',
  workspaceRoot: '',
  loggedIn: false,
  scanning: false,
  projectCount: 0,
  projectNames: [],
  resourceCount: 0,
  violationCount: 0,
  tagIssueCount: 0,
  configFound: false,
};

export class ResourceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'infracost.resourceDetails';

  private view?: vscode.WebviewView;

  private pendingHtml?: string;

  private lastData?: ResourceDetailsResult;

  private client?: LanguageClient;

  private orgInfo?: OrgInfo;

  private guardrails: GuardrailStatus[] = [];

  private codiconUri?: string;

  private cspSource?: string;

  private fileIconUris: Record<string, string> = {};

  constructor(private readonly extensionUri: vscode.Uri) {}

  setClient(c: LanguageClient): void {
    this.client = c;
  }

  setOrgInfo(info: OrgInfo): void {
    this.orgInfo = info;
    if (this.lastData) {
      this.update(this.lastData);
    }
  }

  setGuardrails(guardrails: GuardrailStatus[]): void {
    this.guardrails = guardrails;
  }

  private get renderOpts(): RenderOptions {
    return {
      codiconUri: this.codiconUri,
      cspSource: this.cspSource,
      fileIconUris: this.fileIconUris,
      orgInfo: this.orgInfo,
      guardrails: this.guardrails,
    };
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    // eslint-disable-next-line no-param-reassign
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'node_modules'),
        vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons'),
      ],
    };
    const { webview } = webviewView;
    this.codiconUri = webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this.extensionUri,
          'node_modules',
          '@vscode',
          'codicons',
          'dist',
          'codicon.css'
        )
      )
      .toString();
    this.cspSource = webview.cspSource;
    const iconUri = (name: string) =>
      webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', name))
        .toString();
    this.fileIconUris = {
      tf: iconUri('terraform.svg'),
      yaml: iconUri('yaml.svg'),
      yml: iconUri('yaml.svg'),
      json: iconUri('json.svg'),
    };
    this.view.webview.html = this.pendingHtml ?? renderEmpty([], this.renderOpts);
    this.pendingHtml = undefined;

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.command) {
        case 'login':
          vscode.commands.executeCommand('infracost.login');
          break;
        case 'viewLogs':
          vscode.commands.executeCommand('infracost.showOutputChannel');
          break;
        case 'back':
          this.lastData = { scanning: false };
          this.fetchAndRenderTree();
          break;
        case 'troubleshoot':
          this.showTroubleshooting();
          break;
        case 'restartClient':
          vscode.commands.executeCommand('infracost.restartClient');
          break;
        case 'restartLsp':
          vscode.commands.executeCommand('infracost.restartLsp');
          break;
        case 'generateBundle':
          vscode.commands.executeCommand('infracost.generateBundle');
          break;
        case 'revealResource': {
          const uri = msg.uri || (vscode.window.activeTextEditor?.document.uri.toString() ?? '');
          vscode.commands.executeCommand('infracost.revealResource', uri, msg.line);
          break;
        }
        case 'fixWithCopilot':
          vscode.commands.executeCommand('workbench.action.chat.open', {
            query: msg.prompt,
            isPartialQuery: false,
          });
          break;
        case 'selectOrg':
          this.handleSelectOrg();
          break;
        default:
          break;
      }
    });
  }

  update(data: ResourceDetailsResult): void {
    this.lastData = data;
    if (!data.resource && !data.needsLogin && !data.scanning) {
      this.fetchAndRenderTree();
      return;
    }
    this.setHtml(renderResult(data, isCopilotAvailable(), this.renderOpts));
  }

  showLogin(): void {
    this.lastData = undefined;
    this.setHtml(renderLogin()); // no org footer — not logged in
  }

  showLoginVerifying(userCode: string): void {
    this.setHtml(renderLoginVerifying(userCode));
  }

  private showTroubleshooting(): void {
    if (!this.client) {
      this.setHtml(renderTroubleshooting({ ...DEFAULT_STATUS, version: 'unknown' }));
      return;
    }

    this.client
      .sendRequest<StatusInfo>('infracost/status')
      .then((status) => {
        this.setHtml(renderTroubleshooting(status, this.renderOpts));
      })
      .catch(() => {
        this.setHtml(
          renderTroubleshooting(
            { ...DEFAULT_STATUS, version: 'error fetching status' },
            this.renderOpts
          )
        );
      });
  }

  private fetchAndRenderTree(): void {
    if (!this.client) {
      this.setHtml(renderEmpty([], this.renderOpts));
      return;
    }
    this.client
      .sendRequest<WorkspaceSummaryResult>('infracost/workspaceSummary')
      .then((result) => {
        this.setHtml(renderEmpty(result?.files ?? [], this.renderOpts));
      })
      .catch(() => {
        this.setHtml(renderEmpty([], this.renderOpts));
      });
  }

  handleSelectOrg(): void {
    const { orgInfo, client } = this;
    if (!orgInfo || !client) {
      return;
    }
    const items = orgInfo.organizations.map((o) => ({
      label: o.name,
      description: o.slug,
      orgId: o.id,
    }));
    const qp = vscode.window.createQuickPick<(typeof items)[0]>();
    qp.items = items;
    qp.placeholder = 'Select organization';
    qp.title = 'Switch Infracost Organization';
    const current = items.find((i) => i.orgId === orgInfo.selectedOrgId);
    if (current) {
      qp.activeItems = [current];
    }
    let accepted = false;
    qp.onDidAccept(() => {
      accepted = true;
      const picked = qp.selectedItems[0];
      qp.dispose();
      if (!picked) {
        return;
      }
      client
        .sendRequest<OrgInfo>('infracost/selectOrg', { orgId: picked.orgId })
        .then((updated) => {
          this.setOrgInfo(updated);
          vscode.commands.executeCommand('infracost.restartLsp');
        })
        .catch((err) => {
          vscode.window.showErrorMessage(`Failed to switch organization: ${err}`);
        });
    });
    qp.onDidHide(() => {
      if (!accepted) {
        qp.dispose();
      }
    });
    qp.show();
  }

  private setHtml(html: string): void {
    if (this.view) {
      this.view.webview.html = html;
    } else {
      this.pendingHtml = html;
    }
  }
}
