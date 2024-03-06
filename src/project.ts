import { TemplateDelegate } from 'handlebars';
import Block from './block';
import File from './file';

export default class Project {
  files: { [key: string]: File } = {};

  blocks: { [key: string]: Block } = {};

  constructor(
    public name: string,
    public path: string,
    public currency: string,
    public template: TemplateDelegate
  ) {}

  setBlock(filename: string, name: string, startLine: number): Block {
    if (this.files[filename] === undefined) {
      this.files[filename] = new File(filename, this.currency, this.template);
    }

    const file = this.files[filename];
    const block = file.setBlock(name, startLine);

    if (this.blocks[name] === undefined) {
      this.blocks[name] = block;
    }

    return block;
  }

  getBlock(filename: string, name: string): Block | undefined {
    if (this.files[filename] === undefined) {
      return undefined;
    }

    return this.files[filename].getBlock(name);
  }

  cost(): string {
    const cost = Object.values(this.blocks).reduce(
      (total: number, b: Block): number => total + b.rawCost(),
      0
    );

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
    });

    return formatter.format(cost);
  }
}
