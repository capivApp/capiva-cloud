import js from "@eslint/js";
import eslintPluginPromise from "eslint-plugin-promise";
import eslintPluginSonarjs from "eslint-plugin-sonarjs";
import eslintPluginUnusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";
import canThrow from "./.eslint/index.js";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dev-dist",
      "public",
      "node_modules",
      "coverage",
      "**/__tests__",
      "*.config.js",
      "*.config.ts",
      "src/views",
      ".eslint/**",
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ["**/*.{ts,tsx}"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },

      globals: {
        ...globals.node,
      },
    },

    plugins: {
      "unused-imports": eslintPluginUnusedImports,
      promise: eslintPluginPromise,
      sonarjs: eslintPluginSonarjs,
      "can-throw": canThrow,
    },

    linterOptions: {
      reportUnusedDisableDirectives: true,
    },

    rules: {
      /*
       * =========================================
       * TYPESCRIPT
       * =========================================
       */
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "warn",

      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",

      "@typescript-eslint/no-floating-promises": "error",

      "@typescript-eslint/await-thenable": "error",

      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false,
        },
      ],

      "@typescript-eslint/require-await": "off",

      "@typescript-eslint/return-await": "off",

      "@typescript-eslint/no-unnecessary-condition": "off",

      "@typescript-eslint/no-unnecessary-type-assertion": "warn",

      "@typescript-eslint/prefer-nullish-coalescing": "off",

      "@typescript-eslint/prefer-optional-chain": "warn",

      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-misused-spread": "off",
      "@typescript-eslint/no-non-null-assertion": "off",

      /*
       * =========================================
       * IMPORTS
       * =========================================
       */

      "unused-imports/no-unused-imports": "error",

      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      /*
       * =========================================
       * CODE QUALITY
       * =========================================
       */

      "sonarjs/cognitive-complexity": ["warn", 20],

      eqeqeq: ["error", "always"],

      "no-console": "off",

      "no-debugger": "error",

      curly: "off",

      "prefer-const": "warn",

      "no-var": "error",

      /*
       * =========================================
       * STYLE
       * =========================================
       */

      semi: ["error", "always"],

      quotes: [
        "error",
        "double",
        {
          avoidEscape: true,
        },
      ],
      "can-throw/require-try-catch": "warn",
    },
  },
);
