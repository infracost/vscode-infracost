import * as path from 'path';
import { EventEmitter, TextDocument, TreeItem, window } from 'vscode';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dump, load } from 'js-yaml';
import { tmpdir } from 'os';
import CLI, { infracostJSON } from './cli';
import logger from './log';
import Project from './project';
import Block from './block';
import infracostStatus from './statusBar';
import {
  cleanFilename,
  CONFIG_FILE_NAME,
  CONFIG_TEMPLATE_NAME,
  isValidTerraformFile,
  USAGE_FILE_NAME,
} from './utils';
import webviews from './webview';
import context, { ERROR, LOGGED_IN } from './context';
import { ConfigFile } from './config';

export default class Workspace {
  loading = false;

  projects: { [key: string]: Project } = {};

  filesToProjects: { [key: string]: { [key: string]: true } } = {};

  codeLensEventEmitter: EventEmitter<void> = new EventEmitter<void>();

  isError = false;

  constructor(
    public root: string,
    private cli: CLI,
    private blockTemplate: Handlebars.TemplateDelegate,
    private treeRenderEventEmitter: EventEmitter<TreeItem | void | undefined>,
    private currency: string
  ) {}

  async login() {
    logger.debug('executing infracost login');

    const out = await this.cli.exec(['auth', 'login']);
    if (out.stdout.indexOf('Your account has been authenticated') !== -1) {
      window.showInformationMessage('VS Code is now connected to Infracost');
      logger.debug('successful login response received');
      await context.set(LOGGED_IN, true);
      await this.init();
      return;
    }

    logger.debug(`failed login response was ${out.stdout}`);
    await context.set(LOGGED_IN, false);
  }

  async init() {
    if (!context.isLoggedIn()) {
      window.showInformationMessage(
        'Please [Connect VSCode to Infracost Cloud](command:infracost.login).'
      );
      return;
    }

    infracostStatus.setLoading();
    logger.debug(`initializing workspace`);
    this.projects = {};
    this.filesToProjects = {};
    this.loading = true;
    this.isError = false;

    const out = await this.run();
    if (out === undefined) {
      this.isError = true;
    }

    this.loading = false;
    infracostStatus.setReady();
  }

  static show(block: Block) {
    block.display();
  }

  async fileChange(file: TextDocument) {
    const filename = cleanFilename(file.uri.path);
    const isConfigFileChange =
      filename === path.join(this.root, CONFIG_FILE_NAME) ||
      filename === path.join(this.root, CONFIG_TEMPLATE_NAME);
    const isUsageFileChange = path.basename(filename) === USAGE_FILE_NAME;
    const isValid = (await isValidTerraformFile(file)) || isConfigFileChange || isUsageFileChange;

    if (!isValid) {
      logger.debug(`ignoring file change for path ${filename}`);
      return;
    }

    if (this.isError) {
      // if we're in error then we need to init again as all projects
      // will be nil and thus cannot be resolved to a costs/symbols.
      await this.init();
      return;
    }

    if (isConfigFileChange || filename === path.join(this.root, USAGE_FILE_NAME)) {
      // if we have a root level config or usage file change then we need to init again as all projects
      // we cannot determine which projects have changes.
      await this.init();
      return;
    }

    infracostStatus.setLoading();
    this.loading = true;
    this.codeLensEventEmitter.fire();

    logger.debug(`detected file change for path ${filename}`);

    const projects = this.filesToProjects[filename];
    if (projects === undefined) {
      logger.debug(
        `no valid projects found for path ${filename} attempting to locate project for file`
      );

      const projects: string[] = [];
      for (const project of Object.keys(this.projects)) {
        const projectDir = path.normalize(cleanFilename(project));
        const dir = path.dirname(path.normalize(cleanFilename(filename)));
        logger.debug(`evaluating if ${filename} is within project ${projectDir}`);

        if (projectDir === dir) {
          logger.debug(`using project ${project} for ${filename}, running file change event again`);
          projects.push(project);
        }
      }

      if (projects.length > 0) {
        await this.run(...projects);
        this.loading = false;
        infracostStatus.setReady();
        this.codeLensEventEmitter.fire();
        return;
      }

      this.loading = false;
      infracostStatus.setReady();
      return;
    }

    await this.run(...Object.keys(projects));

    this.loading = false;
    infracostStatus.setReady();
    this.codeLensEventEmitter.fire();
  }

  // TODO: determine or allow users to switch the project they are using.
  project(filename: string): { [key: string]: Block } {
    const projects = this.filesToProjects[filename];

    if (projects && Object.keys(projects).length > 0) {
      const project = Object.keys(projects)[0];
      return this.projects[project].blocks;
    }

    logger.debug(`no projects found for filename ${filename}`);
    return {};
  }

  async run(...changedProjectPaths: string[]): Promise<infracostJSON.Project[] | undefined> {
    try {
      const templateFilePath = path.join(this.root, CONFIG_TEMPLATE_NAME);
      const hasTemplateFilePath = existsSync(templateFilePath);
      let configFilePath = path.join(this.root, CONFIG_FILE_NAME);
      if (hasTemplateFilePath) {
        configFilePath = path.join(tmpdir(), CONFIG_FILE_NAME);
        const out = await this.cli.exec([
          'generate',
          'config',
          '--template-path',
          templateFilePath,
          '--repo-path',
          this.root,
          '--out-file',
          configFilePath,
        ]);

        if (out.stderr !== '') {
          await context.set(ERROR, `${out.stderr}.`);
          return undefined;
        }
      }

      const hasConfigFile = existsSync(configFilePath);
      let projects;
      if (hasConfigFile) {
        projects = await this.runConfigFile(changedProjectPaths, configFilePath);
      } else {
        projects = await this.runBreakdown(changedProjectPaths);
      }

      await this.renderProjectTree(projects, changedProjectPaths.length > 0, hasConfigFile);
      return projects;
    } catch (error) {
      logger.error(`Infracost cmd error trace ${error}`);

      if (changedProjectPaths.length > 0) {
        await context.set(
          ERROR,
          `Could not run the infracost cmd in the \`${this.root}\` directory. This is likely because of a syntax error or invalid project.\n\nSee the Infracost Debug output tab for more information. Go to **View > Output** & select "Infracost Debug" from the dropdown. If this problem continues please open an [issue here](https://github.com/infracost/vscode-infracost).`
        );
        return undefined;
      }

      await context.set(
        ERROR,
        `Error fetching cloud costs with Infracost, please run again by saving the file or reopening the workspace.\n\nSee the Infracost Debug output tab for more information. Go to **View > Output** & select "Infracost Debug" from the dropdown. If this problem continues please open an [issue here](https://github.com/infracost/vscode-infracost).`
      );

      return undefined;
    }
  }

  async runConfigFile(
    changedProjectPaths: string[],
    configFilePath = path.join(this.root, CONFIG_FILE_NAME)
  ): Promise<infracostJSON.Project[]> {
    let args = ['--config-file', configFilePath];
    if (changedProjectPaths.length === 0) {
      logger.debug(`running "infracost breakdown --config-file ${configFilePath}"`);
    } else {
      const changed: { [key: string]: boolean } = changedProjectPaths.reduce(
        (m, projectPath) => ({
          ...m,
          [path.relative(this.root, projectPath)]: true,
        }),
        {}
      );
      logger.debug('filtering config file projects to only those that have changed');

      const doc = <ConfigFile>load(readFileSync(configFilePath, 'utf8'));
      doc.projects = doc.projects.filter((p) => changed[p.path]);

      const str = dump(doc);
      const tmpConfig = path.join(tmpdir(), CONFIG_FILE_NAME);
      writeFileSync(tmpConfig, str);
      args = ['--config-file', configFilePath];
      logger.debug(`running "infracost breakdown --config-file" with changed projects`);
    }

    const out = await this.cli.exec(
      ['breakdown', ...args, '--format', 'json', '--log-level', 'info'],
      this.root
    );
    const body = <infracostJSON.RootObject>JSON.parse(out.stdout);

    return body.projects;
  }

  async runBreakdown(changedProjectPaths: string[]): Promise<infracostJSON.Project[]> {
    let changed = changedProjectPaths;
    const projects: infracostJSON.Project[] = [];
    if (changedProjectPaths.length === 0) {
      changed = [this.root];
    }
    for (const projectPath of changed) {
      logger.debug(`running "infracost breakdown --path ${projectPath}"`);

      const args = ['breakdown', '--path', projectPath, '--format', 'json', '--log-level', 'info'];

      const projectConfigFile = path.join(projectPath, USAGE_FILE_NAME);
      const rootConfigFile = path.join(this.root, USAGE_FILE_NAME);
      if (existsSync(projectConfigFile)) {
        args.push('--usage-file', projectConfigFile);
      } else if (existsSync(rootConfigFile)) {
        args.push('--usage-file', rootConfigFile);
      }

      const out = await this.cli.exec(args);

      const body = <infracostJSON.RootObject>JSON.parse(out.stdout);
      projects.push(...body.projects);
    }

    return projects;
  }

  private async renderProjectTree(
    projects: infracostJSON.Project[],
    init: boolean,
    hasConfigFile: boolean
  ) {
    for (const project of projects) {
      logger.debug(`found project ${project.name}`);

      const projectPath = project.metadata.path;
      const usageFilePath = path.join(projectPath, USAGE_FILE_NAME);
      if (existsSync(usageFilePath)) {
        this.addProjectToFile(usageFilePath, projectPath);
      }

      const name = hasConfigFile ? project.name : path.relative(this.root, projectPath);
      const formatted = new Project(name, projectPath, this.currency, this.blockTemplate);
      for (const resource of project.breakdown.resources) {
        for (const call of resource.metadata.calls) {
          const filename = cleanFilename(call.filename);
          logger.debug(`adding file: ${filename} to project: ${projectPath}`);

          formatted.setBlock(filename, call.blockName).resources.push(resource);
          this.addProjectToFile(filename, projectPath);
        }
      }

      // reload the webviews after the save
      this.projects[projectPath] = formatted;
      Object.keys(webviews.views).forEach((key) => {
        const [filename, blockname] = key.split('|');
        formatted.getBlock(filename, blockname)?.display();
      });

      if (!init) {
        this.treeRenderEventEmitter.fire();
        logger.debug('rebuilding Infracost tree view after project run');
      }
    }

    await context.set(ERROR, undefined);
  }

  private addProjectToFile(filename: string, projectPath: string) {
    if (this.filesToProjects[filename] === undefined) {
      this.filesToProjects[filename] = {};
    }

    this.filesToProjects[filename][projectPath] = true;
  }
}
