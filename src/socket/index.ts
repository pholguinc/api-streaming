import { SocketService } from "../services/socket.service";
import { registerViewerHandler } from "./handlers/viewer.handler";
import { registerChatHandler } from "./handlers/chat.handler";
import { registerStreamHandler } from "./handlers/stream.handler";

/**
 * Inicializa y registra todos los handlers de Socket.IO
 * @param socketService Instancia del servicio de Socket.IO
 */
export const initializeSocketHandlers = (socketService: SocketService) => {
  console.log("🔌 Socket.IO handlers ya están implementados directamente en SocketService");

  console.log("✅ Eventos disponibles:");
  console.log("   📺 Stream: start_streaming, end_streaming");
  console.log("   👁️  Viewer: watch_live, stop_watching, get_streams");
  console.log("   💬 Chat: send-message, typing");
  console.log("   📊 Auto-notifications: viewer_update (automático para streamers)");
  console.log("   📱 TIKTOK FLOW: Lista inicial enviada a TODOS los usuarios");
};

