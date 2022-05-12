// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { exec } from 'child_process';
import {  readFileSync } from 'fs';
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
  ProviderResult,
  SymbolInformation,
  TextDocument,
} from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function  activate(context: vscode.ExtensionContext) {

  
  const w = new Workspace();
  await w.init();

  let disposable = vscode.commands.registerCommand('infracost.resourceBreakdown', w.show);

  context.subscriptions.push(disposable);
  languages.registerCodeLensProvider([{scheme: 'file'}], new InfracostLensProvider(w));
  vscode.workspace.onDidSaveTextDocument(w.fileChange.bind(w));
}

class Project {
  name: string;
  files: {[key: string]: File} = {};

  constructor(name: string) {
    this.name = name;
  }

  file(name: string): File {
    if (this.files[name] === undefined) {
      this.files[name] = new File(name); 
    }

    return this.files[name];
  }
}

class File {
  name: string;
  blocks: {[key: string]:Block} = {};

  constructor(name: string) {
    this.name = name;
  }

  block(name: string): Block {
    if (this.blocks[name] === undefined) {
      this.blocks[name] = new Block(name, this.name);
    }

    return this.blocks[name];
  }
}

class Block {
  name: string;
  filename: string;
  resources: infracostJSON.Resource[] = [];

  constructor(name: string, filename: string) {
    this.name = name;
    this.filename = filename;
  }

  cost(): string {
    let cost: number = 0;

    for (const r of this.resources) {
      if (r.monthlyCost === null) {
        r.monthlyCost = 0;
      }

      cost = +cost + +r.monthlyCost;
    }

    return cost.toFixed(2);
  }
}

class Workspace {
  loading: boolean = false;
  projects: {[key: string]: Project} = {};
  filesToProjects: {[key: string]: {[key: string]: true}} = {};
  codeLensEventEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  constructor() {}

  async init() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders?.length === 0) {
      console.error("Could not run Infracost in workspace, please try setting the project path directly"); 
      return;
    }

    const root = folders[0].uri.fsPath.toString();
    await this.run(root);
  }

  show(name: string) {
    console.log(name);
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
    return "resource."+pieces[pieces.length-2]+"."+pieces[pieces.length-1];
  }

  // TODO: determine or allow users to switch the project they are using.
  project(filename: string): {[key: string]: Block} {
    const projects = this.filesToProjects[filename];

    for (const project in projects) {
      return this.projects[project].file(filename).blocks;
    }

    return {};
  }
  
  async run(path: string): Promise<infracostJSON.RootObject|undefined> {
    try {
      const {stdout, stderr} = await util.promisify(exec)(`/Users/hugorut/code/infracost/infracost/build/infracost breakdown --path ${path} --format json`);
      const body = <infracostJSON.RootObject>JSON.parse(stdout);

      for (const project of body.projects) {
        const projectPath = project.metadata.path;
        this.projects[projectPath] = new Project(projectPath);
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
      console.error("Could not run Infracost in workspace, please try setting the project path directly"); 
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
      const resourceKey = sym.name.replace(/\s+/g, '.').replace(/\"/g, '').replace(/^resource\./, "");
      if (blocks[resourceKey] !== undefined) {
        const cost = blocks[resourceKey].cost();

        let msg = `Total monthly cost: $${cost}`;
        if (this.workspace.loading === true) {
          msg = 'loading...';
        }

        const cmd = new InfracostComand(msg);
        lenses.push(new CodeLens(line.range.with(new Position(line.range.start.line, 0)), cmd));
      } 
    }

    return lenses;
  }

  resolveCodeLens(codeLens: CodeLens, token: CancellationToken): ProviderResult<CodeLens> {
    return undefined;
  }
}

class InfracostComand implements Command {
  command: string = 'infracost.resourceBreakdown';
  title: string;

  constructor(title: string) {
    this.title = title;
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

// this method is called when your extension is deactivated
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
      hourlyQuantity: string;
      monthlyQuantity: string;
      price: string;
      hourlyCost: string;
      monthlyCost: string;
  }


  export interface CostComponent2 {
      name: string;
      unit: string;
      hourlyQuantity: string;
      monthlyQuantity: string;
      price: string;
      hourlyCost: string;
      monthlyCost: string;
  }

  export interface Subresource {
      name: string;
      hourlyCost: string;
      monthlyCost: string;
      costComponents: CostComponent2[];
  }

  export interface Resource {
      name: string;
      metadata: ResourceMetadata;
      hourlyCost: string;
      monthlyCost: number;
      costComponents: CostComponent[];
      subresources: Subresource[];
  }

  export interface Breakdown {
      resources: Resource[];
      totalHourlyCost: string;
      totalMonthlyCost: string;
  }

  export interface Metadata4 {
  }

  export interface CostComponent3 {
      name: string;
      unit: string;
      hourlyQuantity: string;
      monthlyQuantity: string;
      price: string;
      hourlyCost: string;
      monthlyCost: string;
  }

  export interface Metadata5 {
  }

  export interface CostComponent4 {
      name: string;
      unit: string;
      hourlyQuantity: string;
      monthlyQuantity: string;
      price: string;
      hourlyCost: string;
      monthlyCost: string;
  }

  export interface Subresource2 {
      name: string;
      metadata: Metadata5;
      hourlyCost: string;
      monthlyCost: string;
      costComponents: CostComponent4[];
  }

  export interface Resource2 {
      name: string;
      metadata: ResourceMetadata;
      hourlyCost: string;
      monthlyCost: string;
      costComponents: CostComponent3[];
      subresources: Subresource2[];
  }

  export interface Diff {
      resources: Resource2[];
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

  export interface Summary2 {
      totalDetectedResources: number;
      totalSupportedResources: number;
      totalUnsupportedResources: number;
      totalUsageBasedResources: number;
      totalNoPriceResources: number;
      unsupportedResourceCounts: any;
      noPriceResourceCounts: any;
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
      summary: Summary2;
  }

}

