import { commands, SymbolInformation, TextDocument } from 'vscode';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import logger from './log';

export const CONFIG_FILE_NAME = 'infracost.yml';
export const CONFIG_TEMPLATE_NAME = 'infracost.yml.tmpl';
export const USAGE_FILE_NAME = 'infracost-usage.yml';

export function cleanFilename(filename: string): string {
  const replaceDrive = /^\/[A-Z]:/g;
  let cleaned = filename.replace(replaceDrive, (match) => match.toLowerCase());

  if (cleaned.match(/^[a-z]:/)) {
    const slash = /\\+/gi;
    cleaned = `/${cleaned.replace(slash, '/')}`;
  }

  return cleaned;
}

export async function isValidTerraformFile(file: TextDocument): Promise<boolean> {
  const filename = file.uri.path;
  const isTfFile = /.*\.tf$/.test(filename);

  if (!isTfFile) {
    logger.debug(`${filename} is not a valid Terraform file extension`);
    return false;
  }

  const symbols = await commands.executeCommand<SymbolInformation[]>(
    'vscode.executeDocumentSymbolProvider',
    file.uri
  );
  if (symbols === undefined) {
    logger.debug(`no valid Terraform symbols found for file ${filename}`);
    return false;
  }

  return true;
}

export async function getFileEncoding(filepath: string): Promise<string> {
  const d = Buffer.alloc(5, 0);
  const fd = fs.openSync(filepath, 'r');
  fs.readSync(fd, d, 0, 5, 0);
  fs.closeSync(fd);

  if (d[0] === 0xef && d[1] === 0xbb && d[2] === 0xbf) return 'utf8';
  if (d[0] === 0xfe && d[1] === 0xff) return 'utf16be';
  if (d[0] === 0xff && d[1] === 0xfe) return 'utf16le';

  return 'utf8';
}
