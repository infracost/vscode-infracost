import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from('')),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('<div>{{name}}</div>')),
}));

import compileTemplates from '../template';

describe('compileTemplates', () => {
  let readFile: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const fsp = await import('fs/promises');
    readFile = vi.mocked(fsp.readFile);
    readFile.mockResolvedValue(Buffer.from('<div>{{name}}</div>'));
  });

  it('should return a compiled template function', async () => {
    const ctx = {
      asAbsolutePath: vi.fn((p: string) => `/ext/${p}`),
    };

    const template = await compileTemplates(ctx as any);

    expect(typeof template).toBe('function');
  });

  it('should call asAbsolutePath for template files', async () => {
    const ctx = {
      asAbsolutePath: vi.fn((p: string) => `/ext/${p}`),
    };

    await compileTemplates(ctx as any);

    // Should be called for the base template + 4 partials
    expect(ctx.asAbsolutePath).toHaveBeenCalledTimes(5);
  });

  it('should render the template with provided data', async () => {
    readFile.mockResolvedValue(Buffer.from('Hello {{name}}, cost: {{cost}}'));

    const ctx = {
      asAbsolutePath: vi.fn((p: string) => `/ext/${p}`),
    };

    const template = await compileTemplates(ctx as any);
    const result = template({ name: 'test-block', cost: () => '$10.00' });

    expect(result).toContain('test-block');
  });
});

describe('handlebars helpers', () => {
  let compileWithTemplate: (templateStr: string, data?: any) => Promise<string>;

  beforeEach(async () => {
    const fsp = await import('fs/promises');
    const readFile = vi.mocked(fsp.readFile);

    compileWithTemplate = async (templateStr: string, data: any = {}) => {
      readFile.mockResolvedValue(Buffer.from(templateStr));
      const ctx = {
        asAbsolutePath: vi.fn((p: string) => `/ext/${p}`),
      };
      const template = await compileTemplates(ctx as any);
      return template(data);
    };
  });

  it('eq helper should return true for equal values', async () => {
    const result = await compileWithTemplate('{{#if (eq a b)}}yes{{else}}no{{/if}}', {
      a: 1,
      b: 1,
    });
    expect(result).toBe('yes');
  });

  it('eq helper should return false for unequal values', async () => {
    const result = await compileWithTemplate('{{#if (eq a b)}}yes{{else}}no{{/if}}', {
      a: 1,
      b: 2,
    });
    expect(result).toBe('no');
  });

  it('gt helper should compare greater than', async () => {
    const result = await compileWithTemplate('{{#if (gt a b)}}yes{{else}}no{{/if}}', {
      a: 5,
      b: 3,
    });
    expect(result).toBe('yes');
  });

  it('add helper should sum two numbers', async () => {
    const result = await compileWithTemplate('{{add a b}}', { a: 3, b: 4 });
    expect(result).toBe('7');
  });

  it('repeat helper should repeat block n times', async () => {
    const result = await compileWithTemplate('{{#repeat 3}}x{{/repeat}}');
    expect(result).toBe('xxx');
  });

  it('contains helper should check object property existence', async () => {
    const result = await compileWithTemplate('{{#if (contains obj "key")}}yes{{else}}no{{/if}}', {
      obj: { key: 'value' },
    });
    expect(result).toBe('yes');
  });

  it('tags helper should format object as key=value pairs', async () => {
    // Handlebars escapes = to &#x3D; with {{ }} syntax.
    // The source uses {{tags}} not {{{tags}}}, so = gets HTML-escaped.
    const result = await compileWithTemplate('{{tags obj}}', {
      obj: { env: 'prod', team: 'infra' },
    });
    expect(result).toBe('env&#x3D;prod, team&#x3D;infra');
  });

  it('formatPrice helper should format currency', async () => {
    const result = await compileWithTemplate('{{formatPrice currency price}}', {
      currency: 'USD',
      price: 42.5,
    });
    expect(result).toBe('$42.50');
  });

  it('formatTitleWithCurrency helper should return title for USD', async () => {
    const result = await compileWithTemplate('{{formatTitleWithCurrency currency title}}', {
      currency: 'USD',
      title: 'Monthly Cost',
    });
    expect(result).toBe('Monthly Cost');
  });

  it('formatTitleWithCurrency helper should append currency for non-USD', async () => {
    const result = await compileWithTemplate('{{formatTitleWithCurrency currency title}}', {
      currency: 'EUR',
      title: 'Monthly Cost',
    });
    expect(result).toBe('Monthly Cost (EUR)');
  });

  it('increment helper should add 1', async () => {
    const result = await compileWithTemplate('{{increment val}}', { val: 5 });
    expect(result).toBe('6');
  });

  it('blockCost helper should call block.cost()', async () => {
    const block = { cost: () => '$99.99' };
    const result = await compileWithTemplate('{{blockCost block}}', { block });
    expect(result).toBe('$99.99');
  });
});
