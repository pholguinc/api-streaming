import { AuthenticatedSocket } from "../../services/socket.service";
import { JwtPayload } from "../../utils/jwt";

const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/3541/3541871.png";

/**
 * Obtiene el avatar del usuario con valor por defecto si es null
 */
const getUserAvatar = (user: JwtPayload | undefined): string => {
  return user?.avatar || DEFAULT_AVATAR;
};

/**
 * Handler de eventos relacionados con chat en streams
 * Flujo tipo TikTok - Los mensajes NO se guardan en BD
 * Todos los usuarios autenticados pueden chatear
 */
export const registerChatHandler = (socket: AuthenticatedSocket) => {

  /**
   * Evento: send-message
   * Envía un mensaje al chat del stream (broadcaster o viewer)
   */
  socket.on("send-message", (data: { streamUid: string; message: string } | string) => {
    try {
      // Parsear data si viene como string JSON
      let parsedData: { streamUid: string; message: string };
      
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (parseError) {
          console.error("❌ Error al parsear JSON:", parseError);
          socket.emit("error", { 
            event: "send-message",
            message: "Formato de datos inválido" 
          });
          return;
        }
      } else {
        parsedData = data;
      }
      
      const { streamUid, message } = parsedData;
      
      // Debug: Log para diagnosticar el problema
      console.log("🔍 Debug send-message:", {
        originalData: data,
        parsedData,
        message,
        messageType: typeof message,
        messageLength: message?.length,
        isUndefined: message === undefined,
        isNull: message === null,
        isEmpty: message === "",
        trimResult: message?.trim(),
        trimLength: message?.trim()?.length
      });
      
      // Validación más robusta del mensaje
      if (!message || typeof message !== 'string' || message.trim() === "") {
        console.log("❌ Mensaje inválido detectado:", { message, type: typeof message });
        socket.emit("error", { 
          event: "send-message",
          message: "El mensaje no puede estar vacío" 
        });
        return;
      }

      const isBroadcaster = (socket as any).isBroadcaster || false;
      
      console.log(`💬 ${socket.user?.displayName} (@${socket.user?.metroUsername}) ${isBroadcaster ? '🎥' : ''} en stream ${streamUid}: ${message}`);

      const messageData = {
        user: {
          id: socket.user?.id,
          displayName: socket.user?.displayName,
          metroUsername: socket.user?.metroUsername,
          role: socket.user?.role,
          avatar: getUserAvatar(socket.user),
        },
        message: message.trim(),
        timestamp: new Date().toISOString(),
        isBroadcaster,
      };

      // Emitir a todos en el stream (incluyendo al emisor)
      socket.to(`stream-${streamUid}`).emit("new-message", messageData);

      // Confirmar al emisor
      socket.emit("message-sent", messageData);

    } catch (error) {
      console.error("❌ Error al enviar mensaje:", error);
      socket.emit("error", { 
        event: "send-message",
        message: "Error al enviar el mensaje" 
      });
    }
  });

  /**
   * Evento: typing
   * Notifica que un usuario está escribiendo
   */
  socket.on("typing", (data: { streamUid: string; isTyping: boolean }) => {
    try {
      const { streamUid, isTyping } = data;
      
      socket.to(`stream-${streamUid}`).emit("user-typing", {
        user: {
          id: socket.user?.id,
          displayName: socket.user?.displayName,
          metroUsername: socket.user?.metroUsername,
          avatar: getUserAvatar(socket.user),
        },
        isTyping,
      });

    } catch (error) {
      console.error("❌ Error en typing:", error);
    }
  });

};
