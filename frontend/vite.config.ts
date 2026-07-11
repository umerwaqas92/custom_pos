import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base works when served by Express in the desktop app
  base: "/",
  server: {
    port: 3333,
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true
      },
      "/uploads": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true
      }
    }
  }
});
