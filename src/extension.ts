import { exec } from 'child_process';
import { readFile } from 'fs/promises';
import { create, TemplateDelegate } from 'handlebars';
import * as os from 'os';
import * as path from 'path';
import { gte } from 'semver';
import * as util from 'util';
import * as vscode from 'vscode';
import {
  CodeLens,
  CodeLensProvider,
  Command,
  commands,
  DocumentSymbol,
  languages,
  Position,
  SymbolInformation,
  TextDocument,
  TreeItemCollapsibleState,
} from 'vscode';
import tableHeader from './templates/table-headers.hbs';
import costComponentRow from './templates/cost-component-row.hbs';
import emptyTableRows from './templates/empty-table-rows.hbs';
import resourceRows from './templates/resource-rows.hbs';
import blockOutput from './templates/block-output.hbs';

const Handlebars = create();
const debugLog = vscode.window.createOutputChannel('Infracost Debug');

/**
 * infracostStatusBar is a vscode status bar that sits on the bottom of the vscode editor.
 * This is used to show loading to the user.
 */
let infracostStatusBar: vscode.StatusBarItem;

/**
 * webviews is a lookup map of open webviews. This is used by blocks to update the view contents.
 */
let webviews: { [key: string]: vscode.WebviewPanel };

function registerPartialFromFile(name: string, filename: string) {
  readFile(filename).then((data) => {
    Handlebars.registerPartial(name, data.toString());
  });
}

async function compileTemplateFromFile(filename: string): Promise<TemplateDelegate> {
  const buf = await readFile(filename);

  return Handlebars.compile(buf.toString());
}

function registerTemplates(context: vscode.ExtensionContext) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Handlebars.registerHelper('eq', (arg1: any, arg2: any): boolean => arg1 === arg2);

  Handlebars.registerHelper('gt', (arg1: number, arg2: number): boolean => arg1 > arg2);

  Handlebars.registerHelper('add', (arg1: number, arg2: number): number => arg1 + arg2);

  Handlebars.registerHelper('repeat', (n: number, block) => {
    let accum = '';

    for (let i = 0; i < n; ++i) {
      accum += block.fn(i);
    }

    return accum;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Handlebars.registerHelper('contains', (ob: any, arg: string): boolean => ob[arg] !== undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Handlebars.registerHelper('tags', (ob: any): string =>
    Object.keys(ob)
      .map((k) => `${k}=${ob[k]}`)
      .join(', ')
  );

  Handlebars.registerHelper('formatPrice', (currency: string, price: number): string => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    });

    return formatter.format(price);
  });
  Handlebars.registerHelper(
    'formatTitleWithCurrency',
    (currency: string, title: string): string => {
      if (currency === 'USD') {
        return title;
      }

      return `${title} (${currency}`;
    }
  );

  Handlebars.registerHelper('increment', (i: number): number => i + 1);

  Handlebars.registerHelper('blockCost', (block: Block): string => block.cost());

  registerPartialFromFile(
    'costComponentRow',
    context.asAbsolutePath(path.join('dist', costComponentRow))
  );
  registerPartialFromFile(
    'emptyTableRows',
    context.asAbsolutePath(path.join('dist', emptyTableRows))
  );
  registerPartialFromFile('resourceRows', context.asAbsolutePath(path.join('dist', resourceRows)));
  registerPartialFromFile('tableHeaders', context.asAbsolutePath(path.join('dist', tableHeader)));
}

async function isExtensionValid(): Promise<boolean> {
  const terraformExtension = vscode.extensions.getExtension('HashiCorp.terraform');
  if (terraformExtension === undefined) {
    vscode.window.showErrorMessage(
      'The Hashicorp Terraform extension is required for the Infracost extension to work. Please install it: https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform.'
    );
    return false;
  }

  try {
    const cmd = `infracost --version`;
    const { stdout } = await util.promisify(exec)(cmd);
    const version = stdout.replace('Infracost ', '');
    if (!gte(version, '0.10.6')) {
      vscode.window.showErrorMessage(
        `The Infracost extension requires at least version v0.10.6 of the Infracost CLI. Please upgrade your CLI.`
      );
      return false;
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      'The Infracost extension requires the Infracost CLI to function. Please install it: https://www.infracost.io/docs/#1-install-infracost.'
    );
    return false;
  }

  return true;
}

export async function activate(context: vscode.ExtensionContext) {
  if (!(await isExtensionValid())) {
    return;
  }

  // reset the webviews
  webviews = {};

  infracostStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(infracostStatusBar);
  setInfracostStatusLoading();

  registerTemplates(context);
  const template = await compileTemplateFromFile(
    context.asAbsolutePath(path.join('dist', blockOutput))
  );
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders?.length === 0) {
    return;
  }

  const root = folders[0].uri.fsPath.toString();

  const treeEmitter = new vscode.EventEmitter<TreeItem | undefined | void>();
  const w = new Workspace(root, template, treeEmitter);
  const projectProvider = new InfracostProjectProvider(w, treeEmitter);
  vscode.commands.registerCommand('infracost.refresh', () => projectProvider.refresh());
  vscode.window.registerTreeDataProvider('infracostProjects', projectProvider);
  await w.init();

  vscode.commands.registerCommand('infracost.resourceBreakdown', Workspace.show.bind(w));

  languages.registerCodeLensProvider(
    [{ scheme: 'file', pattern: '**/*.tf' }],
    new InfracostLensProvider(w)
  );
  vscode.workspace.onDidSaveTextDocument(w.fileChange.bind(w));
  setInfracostReadyStatus();
}

class Project {
  files: { [key: string]: File } = {};

  blocks: { [key: string]: Block } = {};

  constructor(public name: string, public currency: string, public template: TemplateDelegate) {}

  setBlock(filename: string, name: string): Block {
    if (this.files[filename] === undefined) {
      this.files[filename] = new File(filename, this.currency, this.template);
    }

    const file = this.files[filename];
    const block = file.setBlock(name);

    if (this.blocks[name] === undefined) {
      this.blocks[name] = block;
    }

    return block;
  }

  getBlock(filename: string, name: string): Block | undefined {
    if (this.files[filename] === undefined) {
      return undefined;
    }

    return this.files[filename].getBlock(name);
  }

  cost(): string {
    const cost = Object.values(this.blocks).reduce(
      (total: number, b: Block): number => total + b.rawCost(),
      0
    );

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
    });

    return formatter.format(cost);
  }
}

class File {
  blocks: { [key: string]: Block } = {};

  constructor(public name: string, public currency: string, public template: TemplateDelegate) {}

  rawCost(): number {
    return Object.values(this.blocks).reduce(
      (total: number, b: Block): number => total + b.rawCost(),
      0
    );
  }

  cost(): string {
    const cost = this.rawCost();

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
    });

    return formatter.format(cost);
  }

  setBlock(name: string): Block {
    if (this.blocks[name] === undefined) {
      this.blocks[name] = new Block(name, this.name, this.currency, this.template);
    }

    return this.blocks[name];
  }

  getBlock(name: string): Block | undefined {
    return this.blocks[name];
  }
}

class Block {
  resources: infracostJSON.Resource[] = [];

  webview: vscode.WebviewPanel | undefined;

  constructor(
    public name: string,
    public filename: string,
    public currency: string,
    public template: TemplateDelegate
  ) {
    if (webviews[this.key()] !== undefined) {
      this.webview = webviews[this.key()];
      this.webview.onDidDispose(() => {
        this.webview = undefined;
        delete webviews[this.key()];
      });
    }
  }

  key(): string {
    return `${this.filename}|${this.name}`;
  }

  rawCost(): number {
    let cost = 0;

    for (const r of this.resources) {
      if (r.monthlyCost === null) {
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

    const wp = vscode.window.createWebviewPanel(
      this.name + this.filename,
      this.name,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        retainContextWhenHidden: true,
        enableFindWidget: true,
        enableCommandUris: true,
        enableScripts: true,
      }
    );
    this.webview = wp;
    webviews[`${this.filename}|${this.name}`] = wp;
    this.webview.webview.html = this.template(this);

    this.webview.onDidDispose(() => {
      this.webview = undefined;
      delete webviews[this.key()];
    });

    this.webview.reveal();
  }
}

class Workspace {
  loading = false;

  projects: { [key: string]: Project } = {};

  filesToProjects: { [key: string]: { [key: string]: true } } = {};

  codeLensEventEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

  isError = false;

  constructor(
    public root: string,
    private blockTemplate: TemplateDelegate,
    private treeRenderEventEmitter: vscode.EventEmitter<TreeItem | undefined | void>
  ) {}

  async init() {
    setInfracostStatusLoading();
    debugLog.appendLine(`debug: initializing workspace`);
    this.projects = {};
    this.filesToProjects = {};
    this.loading = true;
    this.isError = false;

    const out = await this.run(this.root, true);
    if (out === undefined) {
      this.isError = true;
      this.loading = false;
      setInfracostReadyStatus();
      return;
    }

    this.isError = false;
    this.loading = false;
    setInfracostReadyStatus();
  }

  static show(block: Block) {
    block.display();
  }

  async fileChange(file: vscode.TextDocument) {
    const filename = cleanFilename(file.uri.path);
    const isValid = await isValidTerraformFile(file);

    if (!isValid) {
      debugLog.appendLine(`debug: ignoring file change for path ${filename}`);
      return;
    }

    if (this.isError) {
      // if we're in error then we need to init again as all projects
      // will be nil and thus cannot be resolved to a costs/symbols.
      await this.init();
      return;
    }

    setInfracostStatusLoading();
    this.loading = true;
    this.codeLensEventEmitter.fire();

    debugLog.appendLine(`debug: detected file change for path ${filename}`);

    const projects = this.filesToProjects[filename];
    if (projects === undefined) {
      debugLog.appendLine(
        `debug: no valid projects found for path ${filename} attempting to locate project for file`
      );

      for (const project of Object.keys(this.projects)) {
        const projectDir = path.normalize(cleanFilename(project));
        const dir = path.dirname(path.normalize(cleanFilename(filename)));
        debugLog.appendLine(`debug: evaluating if ${filename} is within project ${projectDir}`);

        if (projectDir === dir) {
          debugLog.appendLine(
            `debug: using project ${project} for ${filename}, running file change event again`
          );
          await this.run(project);
          this.loading = false;
          setInfracostReadyStatus();
          this.codeLensEventEmitter.fire();
          return;
        }
      }

      this.loading = false;
      setInfracostReadyStatus();
      return;
    }

    for (const name of Object.keys(projects)) {
      await this.run(name);
    }

    this.loading = false;
    setInfracostReadyStatus();
    this.codeLensEventEmitter.fire();
  }

  // TODO: determine or allow users to switch the project they are using.
  project(filename: string): { [key: string]: Block } {
    const projects = this.filesToProjects[filename];

    if (Object.keys(projects).length > 0) {
      const project = Object.keys(projects)[0];
      return this.projects[project].blocks;
    }

    return {};
  }

  async run(projectPath: string, init = false): Promise<infracostJSON.RootObject | undefined> {
    debugLog.appendLine(`debug: running Infracost in project: ${projectPath}`);
    try {
      let cmd = `INFRACOST_CLI_PLATFORM=vscode infracost breakdown --path "${projectPath}" --format json --log-level info`;

      if (os.platform() === 'win32') {
        cmd = `cmd /C "set INFRACOST_CLI_PLATFORM=vscode && infracost breakdown --path "${projectPath}" --format json --log-level info"`;
      }

      debugLog.appendLine(`debug: running Infracost cmd ${cmd}`);

      const { stdout } = await util.promisify(exec)(cmd);
      const body = <infracostJSON.RootObject>JSON.parse(stdout);

      for (const project of body.projects) {
        debugLog.appendLine(`debug: found project ${project.name}`);

        const projectPath = project.metadata.path;
        const formatted = new Project(projectPath, body.currency, this.blockTemplate);
        for (const resource of project.breakdown.resources) {
          for (const call of resource.metadata.calls) {
            const filename = cleanFilename(call.filename);
            debugLog.appendLine(`debug: adding file: ${filename} to project: ${projectPath}`);

            formatted.setBlock(filename, call.blockName).resources.push(resource);

            if (this.filesToProjects[filename] === undefined) {
              this.filesToProjects[filename] = {};
            }

            this.filesToProjects[filename][projectPath] = true;
          }
        }

        // reload the webviews after the save
        this.projects[projectPath] = formatted;
        Object.keys(webviews).forEach((key) => {
          const [filename, blockname] = key.split('|');
          formatted.getBlock(filename, blockname)?.display();
        });

        if (!init) {
          debugLog.appendLine('debug: rebuilding Infracost tree view after project run');
          this.treeRenderEventEmitter.fire();
        }
      }

      return body;
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message ?? '';
        if (msg.toLowerCase().includes('no infracost_api_key environment')) {
          vscode.window.showErrorMessage(
            'Please run `infracost auth login` in your terminal to get a free API. This is used by the Infracost CLI to retrieve prices from our Cloud Pricing API, e.g. get prices for instance types.'
          );
          return undefined;
        }
      }

      debugLog.appendLine(`error: Infracost cmd error trace ${error}`);

      if (init) {
        vscode.window.showErrorMessage(
          `Could not run the infracost cmd in the ${projectPath} directory. This is likely because of a syntax error or invalid project. See the Infracost Debug output tab for more information. Go to View > Output & select "Infracost Debug" from the dropdown. If this problem continues please open an issue here: https://github.com/infracost/vscode-infracost.`
        );
      } else {
        vscode.window.showErrorMessage(
          `Error fetching cloud costs with Infracost, please run again by saving the file or reopening the workspace. See the Infracost Debug output tab for more information. Go to View > Output & select "Infracost Debug" from the dropdown. If this problem continues please open an issue here: https://github.com/infracost/vscode-infracost.`
        );
      }
    }

    return undefined;
  }
}

class InfracostLensProvider implements CodeLensProvider {
  workspace: Workspace;

  onDidChangeCodeLenses: vscode.Event<void>;

  constructor(workspace: Workspace) {
    this.workspace = workspace;
    this.onDidChangeCodeLenses = workspace.codeLensEventEmitter.event;
  }

  async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    const lenses: CodeLens[] = [];
    const filename = cleanFilename(document.uri.path);
    debugLog.appendLine(`debug: providing codelens for file ${filename}`);

    const blocks = this.workspace.project(filename);

    const symbols = await commands.executeCommand<SymbolInformation[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );
    if (symbols === undefined) {
      debugLog.appendLine(`debug: no valid symbols found for file ${filename}`);
      return lenses;
    }

    for (const sym of symbols) {
      debugLog.appendLine(`debug: evaluating symbol: ${sym.name}`);

      if (sym.name.indexOf('resource') === -1 && sym.name.indexOf('module') === -1) {
        debugLog.appendLine(`debug: skipping symbol as not supported for Infracost costs`);
        continue;
      }

      const line = document.lineAt(getRangeFromSymbol(sym).start);
      const resourceKey = sym.name
        .replace(/\s+/g, '.')
        .replace(/"/g, '')
        .replace(/^resource\./g, '');

      debugLog.appendLine(`debug: finding symbol cost using key: ${resourceKey}`);

      if (blocks[resourceKey] !== undefined) {
        const block = blocks[resourceKey];
        const cost = block.cost();
        debugLog.appendLine(
          `debug: found Infracost price for symbol: ${resourceKey} cost: ${cost}`
        );

        let msg = `Total monthly cost: ${cost}`;
        if (this.workspace.loading) {
          msg = 'loading...';
        }

        const cmd = new InfracostCommand(msg, block);
        lenses.push(new CodeLens(line.range.with(new Position(line.range.start.line, 0)), cmd));
        continue;
      }

      debugLog.appendLine(`debug: no registered blocks matching key: ${resourceKey}`);
    }

    return lenses;
  }
}

class InfracostCommand implements Command {
  command = 'infracost.resourceBreakdown';

  arguments?: Block[];

  title: string;

  constructor(title: string, block: Block) {
    this.title = title;
    this.arguments = [block];
  }
}

function getRangeFromSymbol(symbol: DocumentSymbol | SymbolInformation) {
  return isDocumentSymbol(symbol) ? symbol.range : symbol.location.range;
}

function isDocumentSymbol(symbol: DocumentSymbol | SymbolInformation): symbol is DocumentSymbol {
  return is<DocumentSymbol>(symbol, 'children');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function is<T extends object>(o: T | null | undefined): o is T;
function is<T extends object>(o: object, prop: keyof T, value?: any): o is T;
function is<T extends object>(o: object, matcher: (o: object) => boolean): o is T;
function is<T extends object>(
  o: object,
  propOrMatcher?: keyof T | ((o: any) => boolean),
  value?: any
): o is T {
  if (propOrMatcher == null) return o != null;
  if (typeof propOrMatcher === 'function') return propOrMatcher(o);

  return value === undefined
    ? (o as any)[propOrMatcher] !== undefined
    : (o as any)[propOrMatcher] === value;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function isValidTerraformFile(file: vscode.TextDocument): Promise<boolean> {
  const filename = file.uri.path;
  const isTfFile = /.*\.tf$/.test(filename);

  if (!isTfFile) {
    debugLog.appendLine(`debug: ${filename} is not a valid Terraform file extension`);
    return false;
  }

  const symbols = await commands.executeCommand<SymbolInformation[]>(
    'vscode.executeDocumentSymbolProvider',
    file.uri
  );
  if (symbols === undefined) {
    debugLog.appendLine(`debug: no valid Terraform symbols found for file ${filename}`);
    return false;
  }

  return true;
}

function cleanFilename(filename: string): string {
  const replaceC = /^\/C/g;
  let cleaned = filename.replace(replaceC, '/c');

  if (cleaned.startsWith('c')) {
    const slash = /\\+/gi;
    cleaned = `/${cleaned.replace(slash, '/')}`;
  }

  return cleaned;
}

function setInfracostStatusLoading() {
  infracostStatusBar.text = '$(sync~spin) Infracost';
  infracostStatusBar.show();
}

function setInfracostReadyStatus() {
  infracostStatusBar.text = '$(cloud) Infracost';
  infracostStatusBar.show();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}

declare namespace infracostJSON {
  export interface Metadata {
    path: string;
    type: string;
    vcsRepoUrl: string;
    vcsSubPath: string;
  }

  export interface PastBreakdown {
    resources: Resource[];
    totalHourlyCost: string;
    totalMonthlyCost: string;
  }

  export interface ResourceMetadata {
    filename: string;
    calls: Call[];
  }

  export interface Call {
    blockName: string;
    filename: string;
  }

  export interface CostComponent {
    name: string;
    unit: string;
    hourlyQuantity: number;
    monthlyQuantity: number;
    price: string;
    hourlyCost: number;
    monthlyCost: number;
  }

  export interface Resource {
    name: string;
    metadata: ResourceMetadata;
    hourlyCost: string;
    monthlyCost: number;
    costComponents: CostComponent[];
    subresources: Resource[];
  }

  export interface Breakdown {
    resources: Resource[];
    totalHourlyCost: string;
    totalMonthlyCost: string;
  }

  export interface Diff {
    resources: Resource[];
    totalHourlyCost: string;
    totalMonthlyCost: string;
  }

  export interface Summary {
    totalDetectedResources: number;
    totalSupportedResources: number;
    totalUnsupportedResources: number;
    totalUsageBasedResources: number;
    totalNoPriceResources: number;
    unsupportedResourceCounts: Record<string, number>;
    noPriceResourceCounts: Record<string, number>;
  }

  export interface Project {
    name: string;
    metadata: Metadata;
    pastBreakdown: PastBreakdown;
    breakdown: Breakdown;
    diff: Diff;
    summary: Summary;
  }

  export interface RootObject {
    version: string;
    currency: string;
    projects: Project[];
    totalHourlyCost: string;
    totalMonthlyCost: string;
    pastTotalHourlyCost: string;
    pastTotalMonthlyCost: string;
    diffTotalHourlyCost: string;
    diffTotalMonthlyCost: string;
    timeGenerated: Date;
    summary: Summary;
  }
}

export class InfracostProjectProvider implements vscode.TreeDataProvider<TreeItem> {
  /** set hardRefresh as true initially so that the loading indicator is shown */
  private hardRefresh = true;

  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void>;

  constructor(
    private workspace: Workspace,
    private eventEmitter: vscode.EventEmitter<TreeItem | undefined | void>
  ) {
    this.onDidChangeTreeData = eventEmitter.event;
  }

  async refresh() {
    this.hardRefresh = true;
    this.eventEmitter.fire();
  }

  // eslint-disable-next-line class-methods-use-this
  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (element == null && this.hardRefresh) {
      await this.workspace.init();
      this.hardRefresh = false;
    }

    if (!this.workspace) {
      vscode.window.showInformationMessage('Empty workspace');
      return Promise.resolve([]);
    }

    if (element && element.type === 'file') {
      const [projectName, filename] = element.key.split('|');
      const uri = vscode.Uri.file(filename);
      const symbols = await commands.executeCommand<SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      return Promise.resolve(
        Object.values(this.workspace.projects[projectName].blocks)
          .sort((a: Block, b: Block): number => b.rawCost() - a.rawCost())
          .reduce((arr: TreeItem[], b: Block): TreeItem[] => {
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

              const item = new TreeItem(
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
          .reduce((arr: TreeItem[], f: File): TreeItem[] => {
            const name = path.basename(f.name);
            const filePath = path.relative(element.key, f.name);

            if (filePath === name) {
              const item = new TreeItem(
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
      Object.values(this.workspace.projects).map((p: Project): TreeItem => {
        const local = path.relative(this.workspace?.root ?? '', p.name);
        return new TreeItem(
          p.name,
          local,
          p.cost(),
          TreeItemCollapsibleState.Collapsed,
          'project',
          'cloud.svg'
        );
      })
    );
  }
}

class TreeItem extends vscode.TreeItem {
  constructor(
    public readonly key: string,
    public readonly label: string,
    private readonly price: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: string,
    public readonly icon?: string,
    public readonly command?: vscode.Command
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

class JumpToDefinitionCommand implements Command {
  command = 'vscode.open';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arguments: any[] = [];

  constructor(public title: string, uri: vscode.Uri, location: vscode.Location) {
    this.arguments.push(uri, {
      selection: location.range,
    });
  }
}
