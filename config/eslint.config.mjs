// config/eslint.config.mjs
import path from "node:path";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";

// 用于解析 .vue 文件的 parser
const vueParser = await import("vue-eslint-parser");

// 本文件位于 config/，但所有 files/ignores 与 tsconfig 路径都以仓库根目录为基准。
// basePath 让 ESLint 用仓库根目录解析这些相对 glob，而不是 config/。
const repoRoot = path.resolve(import.meta.dirname, "..");

export default await tseslint.config(
  {
    basePath: repoRoot,
  },

  // Android 构建产物由 Capacitor/Gradle 生成，不参与源码检查
  {
    ignores: ["android/app/build/**"],
  },

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
        tsconfigRootDir: repoRoot,
        project: "./src/renderer/tsconfig.json",
      },
    },
  },

  // 针对 src/main 的 tsconfig
  {
    files: ["src/main/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: repoRoot,
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
