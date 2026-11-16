import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    root: ".",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/env.setup.ts"],
    clearMocks: true,
  },
});
