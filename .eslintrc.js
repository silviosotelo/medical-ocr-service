module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: [
    'airbnb-base'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'no-console': 'off',
    'consistent-return': 'off',
    'no-underscore-dangle': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: 'next' }],
    'max-len': ['warn', { code: 120 }],
    'comma-dangle': ['error', 'never'],
    'arrow-body-style': 'off',
    'prefer-arrow-callback': 'off'
  }
};
