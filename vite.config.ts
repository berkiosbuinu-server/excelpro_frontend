import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deux pages : le site (index.html) et le volet du complément Excel (addin.html).
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: "index.html", addin: "addin.html" } } },
});
