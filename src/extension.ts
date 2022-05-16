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
  TextDocument,
} from 'vscode';
import { create, TemplateDelegate } from 'handlebars';
import { readFile } from 'fs/promises';
import tableHeader from './templates/table-headers.hbs';
import costComponentRow from './templates/cost-component-row.hbs';
import emptyTableRows from './templates/empty-table-rows.hbs';
import resourceRows from './templates/resource-rows.hbs';
import blockOutput from './templates/block-output.hbs';
import { join } from 'path';

const Handlebars = create()

function filterZeroValComponents(costComponents: infracostJSON.CostComponent[]): infracostJSON.CostComponent[] {
  if (costComponents === undefined) {
    return [];
  }

  const filtered = costComponents.filter((c: infracostJSON.CostComponent) => {
    if (c.monthlyCost != null && c.monthlyCost != 0) {
      return true;
    }

    return false;
  });

  return filtered;
}

function filterZeroValResources(resources: infracostJSON.Resource[]): infracostJSON.Resource[] {
  if (resources === undefined) {
    return [];
  }

  return resources.filter((r: infracostJSON.Resource) => {
    const filteredComponents = filterZeroValComponents(r.costComponents);
    const filteredResources = filterZeroValResources(r.subresources);

    if (filteredComponents.length === 0 && filteredResources.length === 0) {
      return false;
    }

    return true;
  })
}

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

  Handlebars.registerHelper('filterZeroValComponents', filterZeroValComponents);
  Handlebars.registerHelper('filterZeroValResources', filterZeroValResources);

  registerPartialFromFile('costComponentRow', context.asAbsolutePath(join('dist', costComponentRow)))
  registerPartialFromFile('emptyTableRows', context.asAbsolutePath(join('dist', emptyTableRows)))
  registerPartialFromFile('resourceRows', context.asAbsolutePath(join('dist', resourceRows)))
  registerPartialFromFile('tableHeaders', context.asAbsolutePath(join('dist', tableHeader)))
}

export async function activate(context: vscode.ExtensionContext) {
  registerTemplates(context)
  const template = await compileTemplateFromFile(context.asAbsolutePath(join('dist', blockOutput)));
  const w = new Workspace(template);
  await w.init();

  let disposable = vscode.commands.registerCommand('infracost.resourceBreakdown', w.show.bind(w));

  context.subscriptions.push(disposable);
  languages.registerCodeLensProvider([{ scheme: 'file', pattern: '**/*.tf' }], new InfracostLensProvider(w));
  vscode.workspace.onDidSaveTextDocument(w.fileChange.bind(w));
}

class Project {
  name: string;
  currency: string;
  files: { [key: string]: File } = {};

  constructor(name: string, currency: string) {
    this.name = name;
    this.currency = currency;
  }

  file(name: string): File {
    if (this.files[name] === undefined) {
      this.files[name] = new File(name, this.currency);
    }

    return this.files[name];
  }
}

class File {
  name: string;
  currency: string;
  blocks: { [key: string]: Block } = {};

  constructor(name: string, currency: string) {
    this.name = name;
    this.currency = currency;
  }

  block(name: string): Block {
    if (this.blocks[name] === undefined) {
      this.blocks[name] = new Block(name, this.name, this.currency);
    }

    return this.blocks[name];
  }
}

class Block {
  name: string;
  filename: string;
  currency: string;
  resources: infracostJSON.Resource[] = [];
  webview: vscode.WebviewPanel | undefined;

  constructor(name: string, filename: string, currency: string) {
    this.name = name;
    this.filename = filename;
    this.currency = currency;
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

  display(template: TemplateDelegate) {
    if (this.webview !== undefined) {
      this.webview.webview.html = template(this);
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
    this.webview.webview.html = template(this);

    this.webview.onDidDispose(e => {
      this.webview = undefined;
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
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders?.length === 0) {
      console.error('Could not run Infracost in workspace, please try setting the project path directly');
      return;
    }

    const root = folders[0].uri.fsPath.toString();
    await this.run(root);
  }

  show(block: Block) {
    block.display(this.blockTemplate);
  }

  async fileChange(file: vscode.TextDocument) {
    this.loading = true;
    this.codeLensEventEmitter.fire();

    const filename = file.uri.path;
    const projects = this.filesToProjects[filename];
    if (projects === undefined) {
      return {};
    }

    for (const name in projects) {
      await this.run(name);
    }

    this.loading = false;
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

  async run(path: string): Promise<infracostJSON.RootObject | undefined> {
    try {
      const cmd = `infracost breakdown --path ${path} --format json --log-level info`
      const { stdout, stderr } = await util.promisify(exec)(cmd);
      const body = <infracostJSON.RootObject>JSON.parse(stdout);

      for (const project of body.projects) {
        const projectPath = project.metadata.path;
        this.projects[projectPath] = new Project(projectPath, body.currency);
        for (const resource of project.breakdown.resources) {
          for (const call of resource.metadata.calls) {
            this.projects[projectPath].file(call.filename).block(call.blockName).resources.push(resource);

            if (this.filesToProjects[call.filename] === undefined) {
              this.filesToProjects[call.filename] = {};
            }

            this.filesToProjects[call.filename][projectPath] = true;
          }
        }
      }

      return body;
    } catch (error) {
      console.error('Could not run Infracost in workspace, please try setting the project path directly');
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
    const blocks = this.workspace.project(document.uri.path);

    const symbols = await commands.executeCommand<SymbolInformation[]>('vscode.executeDocumentSymbolProvider', document.uri);
    if (symbols === undefined) {
      return lenses;
    }

    for (const sym of symbols) {
      if (sym.name.indexOf('resource') === -1 && sym.name.indexOf('module') === -1) {
        continue;
      }

      const line = document.lineAt(getRangeFromSymbol(sym).start);
      const resourceKey = sym.name.replace(/\s+/g, '.').replace(/\"/g, '').replace(/^resource\./g, '');
      if (blocks[resourceKey] !== undefined) {
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

export function deactivate() {}

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

