import tsParser from "@typescript-eslint/parser"

export default [
  {
    ignores: [".next/", "node_modules/", "coverage/", ".vercel/"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {},
  },
]
