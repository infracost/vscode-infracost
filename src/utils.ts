import { commands, SymbolInformation, TextDocument } from 'vscode';
import logger from './log';

export function cleanFilename(filename: string): string {
  const replaceC = /^\/C/g;
  let cleaned = filename.replace(replaceC, '/c');

  if (cleaned.startsWith('c')) {
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
