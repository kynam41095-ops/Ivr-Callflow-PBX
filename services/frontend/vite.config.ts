import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // Contract dùng chung nằm ở <repo>/contracts, ngoài root của service —
    // dev server phải được phép đọc lên hai cấp (gốc monorepo).
    fs: { allow: ["../.."] },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
