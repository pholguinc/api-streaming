import { AuthenticatedSocket } from "../../services/socket.service";
import { prisma } from "../../prisma";

/**
 * Handler de eventos relacionados con viewers (espectadores)
 * Flujo simplificado: Conteo automático de viewers al conectar/desconectar
 */
export const registerViewerHandler = (socket: AuthenticatedSocket) => {

  /**
   * Evento: get-viewers-count
   * Obtiene el contador de viewers específico para un stream
   */
  socket.on("get-viewers-count", async (data: { streamUid: string }) => {
    try {
      const { streamUid } = data;
      
      const io = socket.nsp.server;
      
      // Contar viewers específicos de este stream (usuarios en la room específica)
      const socketsInStreamRoom = await io.in(`stream-${streamUid}`).fetchSockets();
      const streamSpecificViewers = socketsInStreamRoom.filter((s: any) => !s.isBroadcaster && s.isAutoViewer).length;
      
      console.log(`📊 ${socket.user?.displayName} solicita contador de viewers para ${streamUid}: ${streamSpecificViewers} viewers`);
      
      socket.emit("viewers-count", {
        streamUid,
        viewersCount: streamSpecificViewers,
        timestamp: new Date().toISOString(),
        isAutoCount: true // Indica que es conteo automático
      });

    } catch (error) {
      console.error("❌ Error al obtener contador de viewers:", error);
      socket.emit("error", { 
        event: "get-viewers-count",
        message: "Error al obtener contador de viewers" 
      });
    }
  });

  /**
   * Cuando un viewer se desconecta, el conteo se actualiza automáticamente
   */
  socket.on("disconnect", async () => {
    try {
      console.log(`📱 ${socket.user?.displayName} desconectado - Conteo automático actualizado`);

    } catch (error) {
      console.error("❌ Error en disconnect de viewer:", error);
    }
  });

};
