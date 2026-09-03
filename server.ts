import express from "express";
import { app } from "./src/express-app";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR !== 'true' ? { port: 24678 } : false,
          watch: process.env.DISABLE_HMR === 'true' ? null : {},
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[Server] Vite middleware mounted");
    } catch (e) {
      console.error("[Server] Failed to create Vite server:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
