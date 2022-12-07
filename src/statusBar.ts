import {ExtensionContext, StatusBarAlignment, StatusBarItem, window, ThemeColor, MarkdownString} from 'vscode';
import context, { ERROR } from './context';

class StatusBar {
  private item: StatusBarItem;

  constructor(item: StatusBarItem) {
    this.item = item;
  }

  setLoading() {
    this.item.text = '$(sync~spin) Infracost';
    this.item.tooltip = undefined;
    this.item.show();
  }

  setReady() {
    const error = context.get(ERROR)
    if (error) {
      this.setError(`${error}`);
      return;
    }

    this.item.text = '$(cloud) Infracost';
    this.item.tooltip = undefined;
    this.item.show();
  }

  setError(msg: string) {
    this.item.text = '$(error) Infracost';
    this.item.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
    this.item.tooltip = new MarkdownString(msg);
    this.item.show();
  }

  subscribeContext(context: ExtensionContext) {
    context.subscriptions.push(this.item);
  }
}

const infracostStatus = new StatusBar(window.createStatusBarItem(StatusBarAlignment.Right, 100));
export default infracostStatus;
