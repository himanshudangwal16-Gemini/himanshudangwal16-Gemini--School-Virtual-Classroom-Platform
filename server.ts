/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Iframe & Embedding Bypass Middleware
  app.use((req, res, next) => {
    // Remove X-Frame-Options to prevent connection refusal on foreign iframes (Google Sites)
    res.removeHeader("X-Frame-Options");
    // Explicitly allow Google Sites, custom Google origins, and general embedding origins
    res.setHeader(
      "Content-Security-Policy",
      "frame-ancestors 'self' * https://sites.google.com https://*.google.com https://*.googleusercontent.com;"
    );
    // Add custom helper headers to reassure older browsers
    res.setHeader("X-Frame-Options", "ALLOWALL");
    next();
  });

  // API health checks or logs
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite development routing vs. production static build
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server running on http://localhost:${PORT}`);
  });
}

startServer();
