import {
  Command,
  commands,
  Event,
  EventEmitter,
  SymbolInformation,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  window,
} from 'vscode';
import * as path from 'path';
import Block from './block';
import Workspace from './workspace';
import File from './file';
import { JumpToDefinitionCommand } from './command';
import Project from './project';

export default class InfracostProjectProvider implements TreeDataProvider<InfracostTreeItem> {
  /** set hardRefresh as true initially so that the loading indicator is shown */
  private hardRefresh = true;

  readonly onDidChangeTreeData: Event<InfracostTreeItem | undefined | void>;

  constructor(
    private workspace: Workspace,
    private eventEmitter: EventEmitter<InfracostTreeItem | undefined | void>
  ) {
    this.onDidChangeTreeData = eventEmitter.event;
  }

  async refresh() {
    this.hardRefresh = true;
    this.eventEmitter.fire();
  }

  // eslint-disable-next-line class-methods-use-this
  getTreeItem(element: InfracostTreeItem): TreeItem {
    return element;
  }

  async getChildren(element?: InfracostTreeItem): Promise<InfracostTreeItem[]> {
    if (element == null && this.hardRefresh) {
      await this.workspace.init();
      this.hardRefresh = false;
    }

    if (!this.workspace) {
      window.showInformationMessage('Empty workspace');
      return Promise.resolve([]);
    }

    if (element && element.type === 'file') {
      const [projectName, filename] = element.key.split('|');
      const uri = Uri.file(filename);
      const symbols = await commands.executeCommand<SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      return Promise.resolve(
        Object.values(this.workspace.projects[projectName].blocks)
          .sort((a: Block, b: Block): number => b.rawCost() - a.rawCost())
          .reduce((arr: InfracostTreeItem[], b: Block): InfracostTreeItem[] => {
            if (filename === b.filename) {
              let cmd: JumpToDefinitionCommand | undefined;
              if (symbols !== undefined) {
                for (const sym of symbols) {
                  const key = sym.name
                    .replace(/\s+/g, '.')
                    .replace(/"/g, '')
                    .replace(/^resource\./g, '');
                  if (key === b.name) {
                    cmd = new JumpToDefinitionCommand('Go to Definition', uri, sym.location);
                    break;
                  }
                }
              }

              const item = new InfracostTreeItem(
                b.key(),
                b.name,
                b.cost(),
                TreeItemCollapsibleState.None,
                'block',
                'cash.svg',
                cmd
              );
              arr.push(item);
            }

            return arr;
          }, [])
      );
    }

    if (element && element.type === 'project') {
      return Promise.resolve(
        Object.values(this.workspace.projects[element.key].files)
          .sort((a: File, b: File): number => b.rawCost() - a.rawCost())
          .reduce((arr: InfracostTreeItem[], f: File): InfracostTreeItem[] => {
            const name = path.basename(f.name);
            const filePath = path.relative(element.key, f.name);

            if (filePath === name) {
              const item = new InfracostTreeItem(
                `${element.key}|${f.name}`,
                name,
                f.cost(),
                TreeItemCollapsibleState.Collapsed,
                'file',
                'terraform.svg'
              );
              arr.push(item);
            }

            return arr;
          }, [])
      );
    }

    return Promise.resolve(
      Object.values(this.workspace.projects).map(
        (p: Project): InfracostTreeItem =>
          new InfracostTreeItem(
            p.path,
            p.name,
            p.cost(),
            TreeItemCollapsibleState.Collapsed,
            'project',
            'cloud.svg'
          )
      )
    );
  }
}

export class InfracostTreeItem extends TreeItem {
  constructor(
    public readonly key: string,
    public readonly label: string,
    private readonly price: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly type: string,
    public readonly icon?: string,
    public readonly command?: Command
  ) {
    super(label, collapsibleState);

    this.tooltip = `${this.label}`;
    this.description = this.price;
    this.contextValue = type;
    if (this.icon) {
      this.iconPath = {
        light: path.join(__filename, '..', '..', 'resources', 'light', this.icon),
        dark: path.join(__filename, '..', '..', 'resources', 'dark', this.icon),
      };
    }
  }
}
