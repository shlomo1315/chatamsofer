import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noHorizontalScroll from "./eslint-rules/no-horizontal-scroll.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ⚠️ עותקי עבודה זמניים של סוכנים — לא קוד חי. הם הוסיפו 23 הפרות
    // לינט מתוך 98, כולן כפילויות של קבצים שכבר נבדקים במקומם האמיתי.
    ".claude/worktrees/**",
  ]),
  // 🔴 אין גלילה לרוחב בשום מקום במערכת — נאכף בלינט, לא רק בתיעוד.
  // ההנחיה נשברה שוב ושוב כשהיא הייתה רק הערה. ראה docs/no-horizontal-scroll.md
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    plugins: { local: { rules: { "no-horizontal-scroll": noHorizontalScroll } } },
    rules: { "local/no-horizontal-scroll": "error" },
  },
]);

export default eslintConfig;
