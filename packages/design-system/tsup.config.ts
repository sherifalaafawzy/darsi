import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", "tokens/index": "src/tokens/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
  target: "es2020",
});
