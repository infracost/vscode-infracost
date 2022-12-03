import * as path from 'path';
import {TemplateDelegate} from 'handlebars';
import {EventEmitter, TextDocument, TreeItem, window} from 'vscode';
import CLI, {infracostJSON} from './cli';
import logger from './log';
import Project from './project';
import Block from './block';
import infracostStatus from './statusBar';
import {cleanFilename, isValidTerraformFile} from './utils';
import webviews from './webview';
import context, {LOGGED_IN} from './context';

export default class Workspace {
  loading = false;

  projects: { [key: string]: Project } = {};

  filesToProjects: { [key: string]: { [key: string]: true } } = {};

  codeLensEventEmitter: EventEmitter<void> = new EventEmitter<void>();

  isError = false;

  constructor(
    public root: string,
    private cli: CLI,
    private blockTemplate: TemplateDelegate,
    private treeRenderEventEmitter: EventEmitter<TreeItem | undefined | void>
  ) {
  }

  async login() {
    logger.debug('executing infracost login');

    const buf = await this.cli.exec('auth', 'login');
    if (buf.stdout.indexOf('Your account has been authenticated') !== -1) {
      logger.debug('successful login response received');
      await context.set(LOGGED_IN, true);
      await this.init();
      return;
    }

    logger.debug(`failed login response was ${buf.stdout}`);
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

    const out = await this.run(this.root, true);
    if (out === undefined) {
      this.isError = true;
      this.loading = false;
      infracostStatus.setReady();
      return;
    }

    this.isError = false;
    this.loading = false;
    infracostStatus.setLoading();
  }

  static show(block: Block) {
    block.display();
  }

  async fileChange(file: TextDocument) {
    const filename = cleanFilename(file.uri.path);
    const isValid = await isValidTerraformFile(file);

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

    infracostStatus.setLoading();
    this.loading = true;
    this.codeLensEventEmitter.fire();

    logger.debug(`detected file change for path ${filename}`);

    const projects = this.filesToProjects[filename];
    if (projects === undefined) {
      logger.debug(
        `no valid projects found for path ${filename} attempting to locate project for file`
      );

      for (const project of Object.keys(this.projects)) {
        const projectDir = path.normalize(cleanFilename(project));
        const dir = path.dirname(path.normalize(cleanFilename(filename)));
        logger.debug(`evaluating if ${filename} is within project ${projectDir}`);

        if (projectDir === dir) {
          logger.debug(`using project ${project} for ${filename}, running file change event again`);
          await this.run(project);
          this.loading = false;
          infracostStatus.setReady();
          this.codeLensEventEmitter.fire();
          return;
        }
      }

      this.loading = false;
      infracostStatus.setReady();
      return;
    }

    for (const name of Object.keys(projects)) {
      await this.run(name);
    }

    this.loading = false;
    infracostStatus.setReady();
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
    logger.debug(`running Infracost in project: ${projectPath}`);
    try {
      logger.debug(`running Infracost breakdown`);

      const buf = await this.cli.exec(
        'breakdown',
        '--path',
        projectPath,
        '--format',
        'json',
        '--log-level',
        'info'
      );

      const body = <infracostJSON.RootObject>JSON.parse(buf.stdout.toString());

      for (const project of body.projects) {
        logger.debug(`found project ${project.name}`);

        const projectPath = project.metadata.path;
        const formatted = new Project(projectPath, body.currency, this.blockTemplate);
        for (const resource of project.breakdown.resources) {
          for (const call of resource.metadata.calls) {
            const filename = cleanFilename(call.filename);
            logger.debug(`adding file: ${filename} to project: ${projectPath}`);

            formatted.setBlock(filename, call.blockName).resources.push(resource);

            if (this.filesToProjects[filename] === undefined) {
              this.filesToProjects[filename] = {};
            }

            this.filesToProjects[filename][projectPath] = true;
          }
        }

        // reload the webviews after the save
        this.projects[projectPath] = formatted;
        Object.keys(webviews.views).forEach((key) => {
          const [filename, blockname] = key.split('|');
          formatted.getBlock(filename, blockname)?.display();
        });

        if (!init) {
          logger.debug('rebuilding Infracost tree view after project run');
          this.treeRenderEventEmitter.fire();
        }
      }

      return body;
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message ?? '';
        if (msg.toLowerCase().includes('no infracost_api_key environment')) {
          window.showErrorMessage(
            'Please run `infracost auth login` in your terminal to get a free API. This is used by the Infracost CLI to retrieve prices from our Cloud Pricing API, e.g. get prices for instance types.'
          );
          return undefined;
        }
      }

      logger.error(`Infracost cmd error trace ${error}`);

      if (init) {
        window.showErrorMessage(
          `Could not run the infracost cmd in the ${projectPath} directory. This is likely because of a syntax error or invalid project. See the Infracost Debug output tab for more information. Go to View > Output & select "Infracost Debug" from the dropdown. If this problem continues please open an issue here: https://github.com/infracost/vscode-infracost.`
        );
      } else {
        window.showErrorMessage(
          `Error fetching cloud costs with Infracost, please run again by saving the file or reopening the workspace. See the Infracost Debug output tab for more information. Go to View > Output & select "Infracost Debug" from the dropdown. If this problem continues please open an issue here: https://github.com/infracost/vscode-infracost.`
        );
      }
    }

    return undefined;
  }
}
