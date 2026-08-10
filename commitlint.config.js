export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 72],
    'subject-min-length': [2, 'always', 5],
    'body-max-line-length': [2, 'always', 80],
    'body-min-length': [2, 'always', 5],
  },
}
