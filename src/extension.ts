import { exec } from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import {
  CancellationToken,
  CodeLens,
  CodeLensProvider,
  Command,
  commands,
  DocumentSymbol,
  languages,
  Position,
  SymbolInformation,
  TextDocument
} from 'vscode';
import { create, TemplateDelegate } from 'handlebars';
import { readFile } from 'fs/promises';
import tableHeader from './templates/table-headers.hbs';
import costComponentRow from './templates/cost-component-row.hbs';
import emptyTableRows from './templates/empty-table-rows.hbs';
import resourceRows from './templates/resource-rows.hbs';
import blockOutput from './templates/block-output.hbs';
import { join } from 'path';
import { gte } from 'semver';
import * as os from 'os';

const Handlebars = create();
const debugLog = vscode.window.createOutputChannel("Infracost Debug");

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
  readFile(filename).then(data => {
    Handlebars.registerPartial(name, data.toString());
  })
}

async function compileTemplateFromFile(filename: string): Promise<TemplateDelegate> {
  const buf = await readFile(filename);

  return Handlebars.compile(buf.toString());
}


function registerTemplates(context: vscode.ExtensionContext) {
  Handlebars.registerHelper('eq', (arg1: any, arg2: any): boolean => {
    return arg1 === arg2;
  });

  Handlebars.registerHelper('gt', (arg1: number, arg2: number): boolean => {
    return arg1 > arg2;
  });

  Handlebars.registerHelper('add', (arg1: number, arg2: number): number => {
    return arg1 + arg2;
  });

  Handlebars.registerHelper('repeat', (n: number, block) => {
    let accum = '';

    for (var i = 0; i < n; ++i) {
      accum += block.fn(i);
    }

    return accum;
  });

  Handlebars.registerHelper('contains', (ob: any, arg: string): boolean => {
    return ob[arg] !== undefined;
  });

  Handlebars.registerHelper('tags', (ob: any): string => {
    return Object.keys(ob).map((k) => {
      return `${k}=${ob[k]}`
    }).join(', ');
  });

  Handlebars.registerHelper('formatPrice', (currency: string, price: number): string => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    });

    return formatter.format(price);
  })

  Handlebars.registerHelper('formatTitleWithCurrency', (currency: string, title: string): string => {
    if (currency === "USD") {
      return title;
    }

    return `${title} (${currency}`;
  })

  Handlebars.registerHelper('increment', (i: number): number => {
    return i + 1;
  })

  Handlebars.registerHelper('blockCost', (block: Block): string => {
    return block.cost();
  })

  registerPartialFromFile('costComponentRow', context.asAbsolutePath(join('dist', costComponentRow)))
  registerPartialFromFile('emptyTableRows', context.asAbsolutePath(join('dist', emptyTableRows)))
  registerPartialFromFile('resourceRows', context.asAbsolutePath(join('dist', resourceRows)))
  registerPartialFromFile('tableHeaders', context.asAbsolutePath(join('dist', tableHeader)))
}

async function isExtensionValid(): Promise<boolean> {
  const terraformExtension = vscode.extensions.getExtension('HashiCorp.terraform');
  if (terraformExtension === undefined) {
    vscode.window.showErrorMessage('The Hashicorp Terraform extension is required for the Infracost extension to work. Please install it: https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform.')
    return false;
  }

  try {
    const cmd = `infracost --version`
    const { stdout } = await util.promisify(exec)(cmd);
    const version = stdout.replace('Infracost ', '')
    if (!gte(version, '0.10.6')) {
      vscode.window.showErrorMessage(`The Infracost extension requires at least version v0.10.6 of the Infracost CLI. Please upgrade your CLI.`)
      return false;
    }
  } catch (error) {
    vscode.window.showErrorMessage('The Infracost extension requires the Infracost CLI to function. Please install it: https://www.infracost.io/docs/#1-install-infracost.')
    return false
  }

  return true
}

export async function activate(context: vscode.ExtensionContext) {
  if (!await isExtensionValid()) {
    return;
  }

  // reset the webviews
  webviews = {};

  infracostStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(infracostStatusBar);
  setInfracostStatusLoading()

  registerTemplates(context)
  const template = await compileTemplateFromFile(context.asAbsolutePath(join('dist', blockOutput)));
  const w = new Workspace(template);
  await w.init();

  let disposable = vscode.commands.registerCommand('infracost.resourceBreakdown', w.show.bind(w));

  context.subscriptions.push(disposable);
  languages.registerCodeLensProvider([{ scheme: 'file', pattern: '**/*.tf' }], new InfracostLensProvider(w));
  vscode.workspace.onDidSaveTextDocument(w.fileChange.bind(w));
  setInfracostReadyStatus()
}

class Project {
  name: string;
  currency: string;
  template: TemplateDelegate;
  files: { [key: string]: File } = {};

  constructor(name: string, currency: string, template: TemplateDelegate) {
    this.name = name;
    this.currency = currency;
    this.template = template;
  }

  file(name: string): File {
    if (this.files[name] === undefined) {
      this.files[name] = new File(name, this.currency, this.template);
    }

    return this.files[name];
  }
}

class File {
  name: string;
  currency: string;
  template: TemplateDelegate;
  blocks: { [key: string]: Block } = {};

  constructor(name: string, currency: string, template: TemplateDelegate) {
    this.name = name;
    this.currency = currency;
    this.template = template;
  }

  block(name: string): Block {
    if (this.blocks[name] === undefined) {
      this.blocks[name] = new Block(name, this.name, this.currency, this.template);
    }

    return this.blocks[name];
  }
}

class Block {
  name: string;
  filename: string;
  currency: string;
  template: TemplateDelegate;
  resources: infracostJSON.Resource[] = [];
  webview: vscode.WebviewPanel | undefined;

  constructor(name: string, filename: string, currency: string, template: TemplateDelegate) {
    this.name = name;
    this.filename = filename;
    this.currency = currency;
    this.template = template;

    if (webviews[this.key()] !== undefined) {
      this.webview = webviews[this.key()];
      this.webview.onDidDispose(e => {
        this.webview = undefined;
        delete webviews[this.key()];
      });
    }
  }

  key(): string {
    return this.filename + '|' + this.name;
  }

  cost(): string {
    let cost: number = 0;

    for (const r of this.resources) {
      if (r.monthlyCost === null) {
        r.monthlyCost = 0;
      }

      cost = +cost + +r.monthlyCost;
    }

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
    )
    this.webview = wp;
    webviews[this.filename + '|' + this.name] = wp;
    this.webview.webview.html = this.template(this);

    this.webview.onDidDispose(e => {
      this.webview = undefined;
      delete webviews[this.key()];
    });

    this.webview.reveal();
  }
}

class Workspace {
  loading: boolean = false;
  projects: { [key: string]: Project } = {};
  filesToProjects: { [key: string]: { [key: string]: true } } = {};
  codeLensEventEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  blockTemplate: TemplateDelegate;

  constructor(blockTemplate: TemplateDelegate) {
    this.blockTemplate = blockTemplate;
  }

  async init() {
    debugLog.appendLine(`debug: initializing workspace`);

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders?.length === 0) {
      return;
    }

    const root = folders[0].uri.fsPath.toString();
    await this.run(root, true);
  }

  show(block: Block) {
    block.display();
  }

  async fileChange(file: vscode.TextDocument) {
    const isTfFile = /.*\.tf$/.test(file.fileName)
    const filename = cleanFilename(file.uri.path);

    if (!isTfFile) {
      debugLog.appendLine(`debug: ignoring file change for path ${filename}, not a terraform`);
      return;
    }

    setInfracostStatusLoading();
    this.loading = true;
    this.codeLensEventEmitter.fire();

    debugLog.appendLine(`debug: detected file change for path ${filename}`);

    const projects = this.filesToProjects[filename];
    if (projects === undefined) {
      debugLog.appendLine(`debug: no valid projects found for path ${filename}`);
      setInfracostReadyStatus();
      return {};
    }

    for (const name in projects) {
      await this.run(name);
    }

    this.loading = false;
    setInfracostReadyStatus();
    this.codeLensEventEmitter.fire();
  }

  localBlockName(name: string): string {
    const pieces = name.split('.');
    return 'resource.' + pieces[pieces.length - 2] + '.' + pieces[pieces.length - 1];
  }

  // TODO: determine or allow users to switch the project they are using.
  project(filename: string): { [key: string]: Block } {
    const projects = this.filesToProjects[filename];

    for (const project in projects) {
      return this.projects[project].file(filename).blocks;
    }

    return {};
  }

  async run(path: string, init: boolean = false): Promise<infracostJSON.RootObject | undefined> {
    debugLog.appendLine(`debug: running Infracost in project: ${path}`);
    try {
      let cmd = `INFRACOST_CLI_PLATFORM=vscode infracost breakdown --path ${path} --format json --log-level info`

      if (os.platform() == 'win32') {
        cmd = `cmd /C "set INFRACOST_CLI_PLATFORM=vscode && infracost breakdown --path ${path} --format json --log-level info"`
      }

      debugLog.appendLine(`debug: running Infracost cmd ${cmd}`);

      const { stdout, stderr } = await util.promisify(exec)(cmd);
      const body = <infracostJSON.RootObject>JSON.parse(stdout);

      for (const project of body.projects) {
        debugLog.appendLine(`debug: found project ${project}`);

        const projectPath = project.metadata.path;
        const formatted = new Project(projectPath, body.currency, this.blockTemplate);
        for (const resource of project.breakdown.resources) {
          for (const call of resource.metadata.calls) {
            const filename = cleanFilename(call.filename);
            debugLog.appendLine(`debug: adding file: ${filename} to project: ${projectPath}`);

            formatted.file(filename).block(call.blockName).resources.push(resource);

            if (this.filesToProjects[filename] === undefined) {
              this.filesToProjects[filename] = {};
            }

            this.filesToProjects[filename][projectPath] = true;
          }
        }

        // reload the webviews after the save
        this.projects[projectPath] = formatted;
        for (const key in webviews) {
          const [filename, blockname] = key.split('|');
          formatted.file(filename).block(blockname).display();
        }
      }

      return body;
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message ?? '';
        if (msg.toLowerCase().includes('no infracost_api_key environment')) {
          vscode.window.showErrorMessage("Please register your infracost CLI by running `infracost register` in your terminal.");
          return;
        }
      }

      debugLog.appendLine(`error: Infracost cmd error trace ${error}`);

      if (init) {
        vscode.window.showErrorMessage(`Could not run the infracost cmd in the ${path} directory. If this is a multi-project workspace please try opening just a single project. If this problem continues please open an issue here: https://github.com/infracost/vscode-infracost.`);
      } else {
        vscode.window.showErrorMessage(`Error fetching cloud costs with Infracost, please run again by saving the file or reopening the Workspace. If this problem continues please open an issue here: https://github.com/infracost/vscode-infracost.`);
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

  async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
    const lenses: CodeLens[] = [];
    const filename = cleanFilename(document.uri.path);
    debugLog.appendLine(`debug: providing codelens for file ${filename}`);

    const blocks = this.workspace.project(filename);

    const symbols = await commands.executeCommand<SymbolInformation[]>('vscode.executeDocumentSymbolProvider', document.uri);
    if (symbols === undefined) {
      debugLog.appendLine(`debug: no valid symbols found for file ${filename}`);
      return lenses;
    }

    for (const sym of symbols) {
      if (sym.name.indexOf('resource') === -1 && sym.name.indexOf('module') === -1) {
        continue;
      }

      const line = document.lineAt(getRangeFromSymbol(sym).start);
      const resourceKey = sym.name.replace(/\s+/g, '.').replace(/\"/g, '').replace(/^resource\./g, '');
      debugLog.appendLine(`debug: evaluating symbol ${resourceKey}`);

      if (blocks[resourceKey] !== undefined) {
        debugLog.appendLine(`debug: found Infracost price for symbol ${resourceKey}`);
        const block = blocks[resourceKey];
        const cost = block.cost();

        let msg = `Total monthly cost: ${cost}`;
        if (this.workspace.loading === true) {
          msg = 'loading...';
        }

        const cmd = new InfracostComand(msg, block);
        lenses.push(new CodeLens(line.range.with(new Position(line.range.start.line, 0)), cmd));
      }
    }

    return lenses;
  }
}

class InfracostComand implements Command {
  command: string = 'infracost.resourceBreakdown';
  arguments?: any[];
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

function is<T extends object>(o: T | null | undefined): o is T;
function is<T extends object>(o: object, prop: keyof T, value?: any): o is T;
function is<T extends object>(o: object, matcher: (o: object) => boolean): o is T;
function is<T extends object>(o: object, propOrMatcher?: keyof T | ((o: any) => boolean), value?: any): o is T {
  if (propOrMatcher == null) return o != null;
  if (typeof propOrMatcher === 'function') return propOrMatcher(o);

  return value === undefined ? (o as any)[propOrMatcher] !== undefined : (o as any)[propOrMatcher] === value;
}

function cleanFilename(filename: string): string  {
  const replaceC = /^\/C/g
  filename = filename.replace(replaceC, '/c')

  if (filename.startsWith('c')) {
    const slash = /\\+/gi;
    filename = '/'+filename.replace(slash, '/');
  }

  return filename;
}

function setInfracostStatusLoading() {
  infracostStatusBar.text = '$(sync~spin) Infracost';
  infracostStatusBar.show();
}

function setInfracostReadyStatus() {
  infracostStatusBar.text = '$(cloud) Infracost';
  infracostStatusBar.show();
}

export function deactivate() {
}

declare module infracostJSON {
  export interface Metadata {
    path: string;
    type: string;
    vcsRepoUrl: string;
    vcsSubPath: string;
  }

  export interface PastBreakdown {
    resources: any[];
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
    unsupportedResourceCounts: any;
    noPriceResourceCounts: any;
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

