// The lint rules are what keep every screen consistent, so they're strict by design.
// See docs/architecture/groundwork.md#keeping-every-screen-consistent.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const betterTailwind = require('eslint-plugin-better-tailwindcss');

const PRIMITIVES = [
  'Text',
  'TextInput',
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'Button',
  'Switch',
];
const primitivesFromUi = {
  name: 'react-native',
  importNames: PRIMITIVES,
  message: 'Use the primitives in @/components/ui so every screen looks and behaves the same.',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'src/uniwind-types.d.ts',
      'src/theme/generated/*',
      'scripts/*',
      'metro.config.js',
    ],
  },

  // Tailwind classes: only the ones the theme defines, no arbitrary values.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'better-tailwindcss': betterTailwind },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/global.css',
        callees: ['cn'],
        attributes: ['className', 'contentContainerClassName', 'columnWrapperClassName'],
      },
    },
    rules: {
      'better-tailwindcss/no-unknown-classes': 'error',
      'better-tailwindcss/no-conflicting-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              pattern: '^.*\\[.*\\].*$',
              message: 'No arbitrary values: add a token to tokens.json instead.',
            },
          ],
        },
      ],
    },
  },

  // Colors and type come from tokens, never from literals.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'Colors come from tokens (theme classes or tokens.ts).',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'Colors come from tokens (theme classes or tokens.ts).',
        },
        {
          selector:
            'Property[key.name=/^(color|backgroundColor|borderColor|shadowColor)$/] > Literal[value=/^(#|rgb|hsl)/]',
          message: 'Colors come from tokens (theme classes or tokens.ts).',
        },
        {
          selector:
            'Property[key.name=/^(fontFamily|fontSize|lineHeight|letterSpacing)$/] > Literal',
          message: 'Type comes from the Text component and its variants.',
        },
      ],
    },
  },

  // Screens use our primitives, not React Native's.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/ui/**'],
    rules: { 'no-restricted-imports': ['error', { paths: [primitivesFromUi] }] },
  },

  // The tiers: ui knows nothing about the app; shared gets its data through props.
  {
    files: ['src/components/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/components/shared*', '@/components/screens*', '@/features*', '@/app*'],
              message: 'ui/ is generic: it imports nothing from the app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [primitivesFromUi],
          patterns: [
            {
              group: ['@/components/screens*', '@/features*', '@/app*'],
              message: 'shared/ gets its data through props; screens wire it to features.',
            },
          ],
        },
      ],
    },
  },

  // Every visible string goes through t(). Dev screens and gallery files are exempt.
  {
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx'],
    ignores: ['src/app/dev/**', '**/*.gallery.tsx', 'src/components/ui/**'],
    rules: { 'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }] },
  },
]);
