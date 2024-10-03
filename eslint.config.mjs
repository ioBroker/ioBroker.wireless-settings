import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                allowDefaultProject: {
                    allow: ['*.mjs'],
                },
            },
        },
    },
    {
        ignores: ['src/**/*', 'admin/**/*', 'test/**/*'],
    },
    {
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
];
