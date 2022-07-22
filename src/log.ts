import { OutputChannel, window } from 'vscode';

class Logger {
  private chan: OutputChannel;

  constructor(chan: OutputChannel) {
    this.chan = chan;
  }

  debug(value: string) {
    this.chan.appendLine(`debug: ${value}`);
  }

  error(value: string) {
    this.chan.appendLine(`error: ${value}`);
  }
}

const logger = new Logger(window.createOutputChannel('Infracost Debug'));
export default logger;
