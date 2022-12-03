import { commands } from 'vscode';
import logger from './log';
import CLI from './cli';

export const LOGGED_IN = 'loggedIn';

class Context {
  private data: { [k: string]: unknown } = {};

  async init(cli: CLI) {
    this.data = {};

    const buf = await cli.exec('configure', 'get', 'api_key');
    if (buf.stderr.indexOf('No API key') === -1) {
      await this.set(LOGGED_IN, true);
    }
  }

  async set(key: string, value: unknown) {
    logger.debug(`setting context infracost:${key} to ${value}`);

    this.data[key] = value;
    await commands.executeCommand('setContext', `infracost:${key}`, value);
  }

  get(key: string): unknown | undefined {
    return this.data[key];
  }

  isLoggedIn(): boolean {
    return this.data[LOGGED_IN] === true;
  }
}

const context = new Context();
export default context;
