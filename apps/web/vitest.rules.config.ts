import { defineConfig } from "vitest/config";

// Security rules tests (tests-rules/), run against the emulators: npm run test:rules
export default defineConfig({ test: { environment: "node", globals: true, include: ["tests-rules/**/*.test.ts"], testTimeout: 20000, hookTimeout: 30000, fileParallelism: false } });
