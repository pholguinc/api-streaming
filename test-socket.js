// Script para probar la conexión del Socket
const { io } = require("socket.io-client");

// Reemplaza con un token JWT válido de telemetro-backend
const JWT_TOKEN = process.argv[2] || "TU_TOKEN_AQUI";

const socket = io("http://localhost:9001", {
    path: "/api/v1/streaming",
    auth: {
        token: JWT_TOKEN
    }
});

socket.on("connect", () => {
    console.log("CONECTADO AL SOCKET!");
    console.log("Socket ID:", socket.id);
});

socket.on("user-info", (data) => {
    console.log("Info del usuario:", data);
});

socket.on("streams-list", (data) => {
    console.log("Lista de streams:", data);
});

socket.on("connect_error", (error) => {
    console.log("ERROR DE CONEXIÓN:", error.message);
});

socket.on("error", (error) => {
    console.log("ERROR:", error);
});

// Mantener conexión por 10 segundos
setTimeout(() => {
    console.log("\n🔌 Desconectando...");
    socket.disconnect();
    process.exit(0);
}, 10000);
