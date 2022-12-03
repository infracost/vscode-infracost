import { Uri, Command, Location } from 'vscode';
import Block from './block';

export class JumpToDefinitionCommand implements Command {
  command = 'vscode.open';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arguments: any[] = [];

  constructor(public title: string, uri: Uri, location: Location) {
    this.arguments.push(uri, {
      selection: location.range,
    });
  }
}

export class InfracostCommand implements Command {
  command = 'infracost.resourceBreakdown';

  arguments?: Block[];

  title: string;

  constructor(title: string, block: Block) {
    this.title = title;
    this.arguments = [block];
  }
}
