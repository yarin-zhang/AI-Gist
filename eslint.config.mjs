// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default await tseslint.config(
  // 用于所有 TypeScript 文件
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      // 更多规则
    },
  },
  // 为不同的 TypeScript 配置创建单独的配置
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./src/renderer/tsconfig.json",
      },
    },
  },
  {
    files: ["src/main/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./src/main/tsconfig.json",
      },
    },
  }
);
