import { TemplateDelegate } from 'handlebars';
import Block from './block';

export default class File {
  blocks: { [key: string]: Block } = {};

  constructor(public name: string, public currency: string, public template: TemplateDelegate) {}

  rawCost(): number {
    return Object.values(this.blocks).reduce(
      (total: number, b: Block): number => total + b.rawCost(),
      0
    );
  }

  cost(): string {
    const cost = this.rawCost();

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
    });

    return formatter.format(cost);
  }

  setBlock(name: string, startLine: number): Block {
    if (this.blocks[name] === undefined) {
      this.blocks[name] = new Block(name, startLine, this.name, this.currency, this.template);
    }

    return this.blocks[name];
  }

  getBlock(name: string): Block | undefined {
    return this.blocks[name];
  }
}
