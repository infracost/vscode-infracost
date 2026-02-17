module.exports = {
  root: true,
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  settings: {
    'import/resolver': {
      node: {
        paths: ['src'],
        extensions: ['.ts', '.js'],
      },
    },
    'import/core-modules': ['vscode'],
  },
  rules: {
    'import/extensions': 'off',
    'max-classes-per-file': 'off',
    'max-len': 'off',
    'no-await-in-loop': 'off',
    'no-continue': 'off',
    'no-plusplus': 'off',
    'no-restricted-syntax': 'off',
    'no-shadow': 'off',
    'no-use-before-define': 'off',
    'no-useless-constructor': 'off',
    '@typescript-eslint/no-namespace': 'off',
  },
  ignorePatterns: [
    'webpack.config.js',
  ],
  overrides: [
    {
      files: ['vitest.config.ts'],
      rules: {
        'import/no-unresolved': 'off',
        'consistent-return': 'off',
      },
    },
    {
      files: ['**/__test__/**'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        'lines-between-class-members': 'off',
        'no-underscore-dangle': 'off',
        'no-param-reassign': 'off',
        'dot-notation': 'off',
        'import/first': 'off',
        'global-require': 'off',
      },
    },
  ],
};
