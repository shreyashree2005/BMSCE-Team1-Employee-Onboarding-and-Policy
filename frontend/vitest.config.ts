import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    testTimeout: 15_000,
    // Each worker runs a full jsdom app. One worker per CPU thread (the default, ~15 here) starved each other on a
    // busy laptop and made tests time out; a few workers finish in about the same time without the flakiness.
    maxWorkers: 4,
  },
});
