// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";

// 用于解析 .vue 文件的 parser
const vueParser = await import("vue-eslint-parser");

export default await tseslint.config(
  // 通用 TypeScript 设置
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // 针对 src/renderer 的 tsconfig
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./src/renderer/tsconfig.json",
      },
    },
  },

  // 针对 src/main 的 tsconfig
  {
    files: ["src/main/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./src/main/tsconfig.json",
      },
    },
  },

  // 支持 Vue 文件（全局范围）
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser.default,
      parserOptions: {
        parser: {
          ts: "@typescript-eslint/parser",
        },
        ecmaVersion: "latest",
        sourceType: "module",
        extraFileExtensions: [".vue"],
      },
    },
    plugins: {
      vue,
    }
  }
);
