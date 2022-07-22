import { WebviewPanel } from 'vscode';

/**
 * webviews is a lookup map of open webviews. This is used by blocks to update the view contents.
 */
class Webviews {
  views: { [key: string]: WebviewPanel } = {};

  init() {
    this.views = {};
  }

  add(key: string, panel: WebviewPanel, dispose?: (e: void) => unknown) {
    this.views[key] = panel;

    panel.onDidDispose(() => {
      delete this.views[key];

      if (dispose) {
        dispose();
      }
    });
  }

  onDispose(key: string, dispose: (e: void) => unknown) {
    const view = this.views[key];
    if (!view) {
      return;
    }

    view.onDidDispose(() => {
      delete this.views[key];
      dispose();
    });
  }

  get(key: string): WebviewPanel | undefined {
    return this.views[key];
  }
}

const webviews = new Webviews();
export default webviews;
