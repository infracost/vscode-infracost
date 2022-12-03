import { create, TemplateDelegate } from 'handlebars';
import { readFileSync } from 'fs';
import { ExtensionContext } from 'vscode';
import { readFile } from 'fs/promises';
import * as path from 'path';
import Block from './block';
import tableHeader from './templates/table-headers.hbs';
import costComponentRow from './templates/cost-component-row.hbs';
import emptyTableRows from './templates/empty-table-rows.hbs';
import resourceRows from './templates/resource-rows.hbs';
import blockOutput from './templates/block-output.hbs';

export default async function compileTemplates(
  context: ExtensionContext
): Promise<TemplateDelegate> {
  const handleBars = create();
  const baseTemplate = context.asAbsolutePath(path.join('dist', blockOutput));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleBars.registerHelper('eq', (arg1: any, arg2: any): boolean => arg1 === arg2);

  handleBars.registerHelper('gt', (arg1: number, arg2: number): boolean => arg1 > arg2);

  handleBars.registerHelper('add', (arg1: number, arg2: number): number => arg1 + arg2);

  handleBars.registerHelper('repeat', (n: number, block) => {
    let accum = '';

    for (let i = 0; i < n; ++i) {
      accum += block.fn(i);
    }

    return accum;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleBars.registerHelper('contains', (ob: any, arg: string): boolean => ob[arg] !== undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleBars.registerHelper('tags', (ob: any): string =>
    Object.keys(ob)
      .map((k) => `${k}=${ob[k]}`)
      .join(', ')
  );

  handleBars.registerHelper('formatPrice', (currency: string, price: number): string => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    });

    return formatter.format(price);
  });
  handleBars.registerHelper(
    'formatTitleWithCurrency',
    (currency: string, title: string): string => {
      if (currency === 'USD') {
        return title;
      }

      return `${title} (${currency}`;
    }
  );

  handleBars.registerHelper('increment', (i: number): number => i + 1);

  handleBars.registerHelper('blockCost', (block: Block): string => block.cost());

  let data = readFileSync(context.asAbsolutePath(path.join('dist', costComponentRow)));
  handleBars.registerPartial('costComponentRow', data.toString());

  data = readFileSync(context.asAbsolutePath(path.join('dist', emptyTableRows)));
  handleBars.registerPartial('emptyTableRows', data.toString());

  data = readFileSync(context.asAbsolutePath(path.join('dist', resourceRows)));
  handleBars.registerPartial('resourceRows', data.toString());

  data = readFileSync(context.asAbsolutePath(path.join('dist', tableHeader)));
  handleBars.registerPartial('tableHeaders', data.toString());

  const buf = await readFile(baseTemplate);
  return handleBars.compile(buf.toString());
}
