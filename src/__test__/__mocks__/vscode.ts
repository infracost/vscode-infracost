import { vi } from 'vitest';

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(public start: Position, public end: Position) {}
}

export class Uri {
  constructor(
    public scheme: string,
    public authority: string,
    public path: string,
    public query: string,
    public fragment: string
  ) {}

  get fsPath(): string {
    return this.path;
  }

  toString(): string {
    return this.path;
  }

  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }

  static parse(value: string): Uri {
    return new Uri('file', '', value, '', '');
  }
}

export class Location {
  constructor(public uri: Uri, public range: Range) {}
}

export const ViewColumn = {
  Beside: 2,
};

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label?: string;
  collapsibleState?: TreeItemCollapsibleState;
  tooltip?: string;
  description?: string;
  contextValue?: string;
  iconPath?: { light: string; dark: string };

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class MarkdownString {
  constructor(public value?: string) {}
}

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export class EventEmitter<T> {
  private handlers: ((e: T) => void)[] = [];

  event = (handler: (e: T) => void) => {
    this.handlers.push(handler);
    return { dispose: vi.fn() };
  };

  fire(data?: T) {
    this.handlers.forEach((h) => h(data as T));
  }

  dispose() {
    this.handlers = [];
  }
}

export class CodeLens {
  constructor(public range: Range, public command?: any) {}
}

const createMockStatusBarItem = () => ({
  text: '',
  tooltip: undefined as any,
  backgroundColor: undefined as any,
  show: vi.fn(),
  hide: vi.fn(),
  dispose: vi.fn(),
});

const createMockOutputChannel = () => ({
  appendLine: vi.fn(),
  append: vi.fn(),
  clear: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  dispose: vi.fn(),
});

const createMockWebviewPanel = () => ({
  webview: { html: '' },
  reveal: vi.fn(),
  dispose: vi.fn(),
  onDidDispose: vi.fn((cb: () => void) => {
    (createMockWebviewPanel as any)._disposeCallback = cb;
    return { dispose: vi.fn() };
  }),
});

export const window = {
  createOutputChannel: vi.fn(() => createMockOutputChannel()),
  createStatusBarItem: vi.fn(() => createMockStatusBarItem()),
  createWebviewPanel: vi.fn(() => createMockWebviewPanel()),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  registerTreeDataProvider: vi.fn(),
};

export const commands = {
  executeCommand: vi.fn(),
  registerCommand: vi.fn(),
};

export const languages = {
  registerCodeLensProvider: vi.fn(),
};

export const workspace = {
  workspaceFolders: undefined as any,
  onDidSaveTextDocument: vi.fn(),
};

export type SymbolInformation = {
  name: string;
  location: Location;
};

export type ExtensionContext = {
  extensionPath: string;
  subscriptions: { dispose: () => void }[];
  asAbsolutePath: (relativePath: string) => string;
};

export type TextDocument = {
  uri: Uri;
};

export type WebviewPanel = {
  webview: { html: string };
  reveal: () => void;
  dispose: () => void;
  onDidDispose: (cb: () => void) => { dispose: () => void };
};

export type StatusBarItem = {
  text: string;
  tooltip: any;
  backgroundColor: any;
  show: () => void;
  hide: () => void;
  dispose: () => void;
};

export type OutputChannel = {
  appendLine: (value: string) => void;
  append: (value: string) => void;
  clear: () => void;
  show: () => void;
  hide: () => void;
  dispose: () => void;
};

export type Command = {
  title: string;
  command: string;
  arguments?: any[];
};
