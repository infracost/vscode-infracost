import * as vscode from 'vscode';

const slogLevel = /^time=\S+\s+level=([A-Za-z]+)/;

let channel: vscode.LogOutputChannel | undefined;

// vscode-languageclient sends all server stderr to outputChannel.error().
export function serverLogChannel(): vscode.LogOutputChannel {
  if (channel) {
    return channel;
  }

  const target = vscode.window.createOutputChannel('Infracost', { log: true });
  channel = new Proxy(target, {
    get(t, prop) {
      if (prop === 'error') {
        return (value: string | Error, ...args: unknown[]) => logAtLevel(t, value, args);
      }
      const value = Reflect.get(t, prop);
      return typeof value === 'function' ? value.bind(t) : value;
    },
  });

  return channel;
}

export function logLevelMethod(
  c: vscode.LogOutputChannel,
  level: string | undefined,
): (message: string) => void {
  switch (level?.toUpperCase()) {
    case 'DEBUG':
      return (m) => c.debug(m);
    case 'WARN':
    case 'WARNING':
      return (m) => c.warn(m);
    case 'ERROR':
      return (m) => c.error(m);
    default:
      return (m) => c.info(m);
  }
}

function logAtLevel(c: vscode.LogOutputChannel, value: string | Error, args: unknown[]): void {
  if (typeof value !== 'string') {
    c.error(value, ...args);
    return;
  }

  const level = slogLevel.exec(value)?.[1];
  if (!level) {
    c.error(value, ...args);
    return;
  }

  logLevelMethod(c, level)(value);
}
