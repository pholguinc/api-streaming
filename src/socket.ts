import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { SocketService } from "./services/socket.service";
import { initializeSocketHandlers } from "./socket/index";

// Crear servidor HTTP mínimo para Socket.IO
const httpServer = http.createServer();

// Path personalizado (opcional)
const SOCKET_PATH = process.env.SOCKET_PATH || "/api/v1/streaming";

// Inicializar Socket.IO con path
const socketService = SocketService.getInstance(httpServer, SOCKET_PATH);

// Registrar todos los handlers de eventos
initializeSocketHandlers(socketService);

const SOCKET_PORT = process.env.SOCKET_PORT || 9001;

httpServer.listen(SOCKET_PORT, () => {
  console.log(`🔌 Servidor WebSocket corriendo en http://localhost:${SOCKET_PORT}`);
  console.log(`📍 Path del socket: ${socketService.getPath()}`);
  console.log(`\n📋 Para conectar desde el cliente, usa:`);
  console.log(`   const socket = io("http://localhost:${SOCKET_PORT}", { path: "${socketService.getPath()}" });\n`);
});

