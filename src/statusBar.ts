import { StatusBarItem, window, StatusBarAlignment, ExtensionContext } from 'vscode';

class StatusBar {
  private item: StatusBarItem;

  constructor(item: StatusBarItem) {
    this.item = item;
  }

  setLoading() {
    this.item.text = '$(sync~spin) Infracost';
    this.item.show();
  }

  setReady() {
    this.item.text = '$(cloud) Infracost';
    this.item.show();
  }

  subscribeContext(context: ExtensionContext) {
    context.subscriptions.push(this.item);
  }
}

const infracostStatus = new StatusBar(window.createStatusBarItem(StatusBarAlignment.Right, 100));
export default infracostStatus;
