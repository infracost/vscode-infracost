import { ViewColumn, WebviewPanel, window } from 'vscode';
import { TemplateDelegate } from 'handlebars';
import { infracostJSON } from './cli';
import webviews from './webview';

export default class Block {
  resources: infracostJSON.Resource[] = [];

  webview: WebviewPanel | undefined;

  constructor(
    public name: string,
    public filename: string,
    public currency: string,
    public template: TemplateDelegate
  ) {
    const view = webviews.get(this.key());
    if (view !== undefined) {
      this.webview = view;
      webviews.onDispose(this.key(), () => {
        this.webview = undefined;
      });
    }
  }

  key(): string {
    return `${this.filename}|${this.name}`;
  }

  rawCost(): number {
    let cost = 0;

    for (const r of this.resources) {
      if (r.monthlyCost == null) {
        r.monthlyCost = 0;
      }

      cost = +cost + +r.monthlyCost;
    }

    return cost;
  }

  cost(): string {
    const cost = this.rawCost();

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
    });

    return formatter.format(cost);
  }

  display() {
    if (this.webview !== undefined) {
      this.webview.webview.html = this.template(this);
      this.webview.reveal();
      return;
    }

    const wp = window.createWebviewPanel(
      this.name + this.filename,
      this.name,
      { viewColumn: ViewColumn.Beside, preserveFocus: false },
      {
        retainContextWhenHidden: true,
        enableFindWidget: true,
        enableCommandUris: true,
        enableScripts: true,
      }
    );
    this.webview = wp;
    webviews.add(`${this.filename}|${this.name}`, wp, () => {
      this.webview = undefined;
    });

    this.webview.webview.html = this.template(this);
    this.webview.reveal();
  }
}
