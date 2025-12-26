import dotenv from "dotenv";
dotenv.config();

import express from "express";
import streamRoutes from "./routes/stream.routes";
import { setupSwagger } from "./swagger";

const app = express();

app.use(express.json());

// Configurar Swagger
setupSwagger(app);

app.use("/api/streaming", streamRoutes);

app.get("/", (_, res) => {
  res.send("Servidor Cloudflare WebRTC funcionando 🚀");
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor API REST corriendo en http://localhost:${PORT}`);
});
