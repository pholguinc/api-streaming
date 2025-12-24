import { AuthenticatedSocket } from "../../services/socket.service";
import { prisma } from "../../prisma";

/**
 * Handler de eventos relacionados con transmisiones/streams
 * Flujo tipo TikTok: Los usuarios ven inmediatamente todos los streams activos al conectar
 */
export const registerStreamHandler = (socket: AuthenticatedSocket) => {
  

  socket.on("start-stream", async (data: any) => {
    try {
      
      // Parsear el JSON si viene como string
      let parsedData;
      if (typeof data === 'string') {
        parsedData = JSON.parse(data);
      } else {
        parsedData = data;
      }
      
      const streamUid = parsedData.streamUid;
      
      if (!streamUid) {
        socket.emit("error", { message: "streamUid es requerido" });
        return;
      }

      // Verificar que el usuario tiene rol de streamer
      if (socket.user?.role !== "metro_streamer") {
        socket.emit("error", { message: "Se requiere rol metro_streamer" });
        return;
      }

      // Verificar que el stream existe y pertenece al usuario
      const stream = await prisma.stream.findUnique({
        where: { uid: streamUid }
      });

      if (!stream || stream.userId !== socket.user?.id) {
        socket.emit("error", { message: "Stream no encontrado o no tienes permisos" });
        return;
      }

      // SOLO cambiar el estado a ACTIVE y guardar info del streamer
      await prisma.stream.update({
        where: { uid: streamUid },
        data: { 
          status: "active",
          displayName: socket.user?.displayName,
          metroUsername: socket.user?.metroUsername
        } as any
      });

      console.log(`🎥 ${socket.user?.displayName} cambia estado a ACTIVE: ${streamUid}`);

      // Emitir lista actualizada de streams a todos los clientes
      await emitStreamsList(socket);

      // Confirmar al cliente en el MISMO evento start-stream
      socket.emit("start-stream", {
        success: true,
        streamUid,
        status: "active",
        title: stream.title,
        webRTCPlaybackUrl: stream.webRTCPlaybackUrl,
        broadcaster: {
          displayName: socket.user?.displayName,
          metroUsername: socket.user?.metroUsername,
          userId: socket.user?.id
        },
        message: "✅ Stream iniciado exitosamente - El stream está ACTIVO y visible para todos los usuarios",
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("❌ Error:", error);
      socket.emit("error", { message: "Error al cambiar estado" });
    }
  });

  /**
   * Evento: end-stream
   * Broadcaster finaliza su transmisión (cambia estado a offline)
   */
  socket.on("end-stream", async (data: any) => {
    try {
      // Parsear el JSON si viene como string
      let parsedData;
      if (typeof data === 'string') {
        parsedData = JSON.parse(data);
      } else {
        parsedData = data;
      }
      
      const streamUid = parsedData.streamUid;
      
      if (!streamUid) {
        socket.emit("error", { message: "streamUid es requerido" });
        return;
      }

      console.log(`🛑 ${socket.user?.displayName} (@${socket.user?.metroUsername}) finaliza stream: ${streamUid}`);

      // Verificar que es el broadcaster
      const stream = await prisma.stream.findUnique({
        where: { uid: streamUid }
      });

      if (!stream || stream.userId !== socket.user?.id) {
        socket.emit("error", { 
          event: "end-stream",
          message: "No tienes permiso para finalizar este stream" 
        });
        return;
      }

      // Actualizar estado a OFFLINE en BD
      await prisma.stream.update({
        where: { uid: streamUid },
        data: { status: "offline" }
      });

      // Emitir lista actualizada de streams a todos los clientes
      await emitStreamsList(socket);

      // Salir de la room
      socket.leave(`stream-${streamUid}`);

      // Limpiar metadata
      delete (socket as any).streamUid;
      delete (socket as any).isBroadcaster;

      // Confirmar al cliente en el MISMO evento end-stream
      socket.emit("end-stream", { 
        success: true,
        streamUid,
        status: "offline",
        title: stream.title,
        broadcaster: {
          displayName: socket.user?.displayName,
          metroUsername: socket.user?.metroUsername,
          userId: socket.user?.id
        },
        message: "✅ Stream finalizado exitosamente - El stream ya no está visible",
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("❌ Error al finalizar stream:", error);
      socket.emit("error", { 
        event: "end-stream",
        message: "Error al finalizar el stream" 
      });
    }
  });
};

/**
 * Función helper para emitir la lista actualizada de streams a TODOS los clientes
 * Incluye contador de viewers actualizado automáticamente
 */
const emitStreamsList = async (socket: AuthenticatedSocket) => {
  try {
    // Obtener todos los streams activos
    const activeStreams = await prisma.stream.findMany({
      where: { status: "active" },
      select: {
        uid: true,
        title: true,
        status: true,
        webRTCPlaybackUrl: true,
        userId: true,
        displayName: true,
        metroUsername: true,
        createdAt: true,
        updatedAt: true
      } as any
    });

    // Agregar contador de viewers específico a cada stream
    const streamsWithViewers = await Promise.all(
      activeStreams.map(async (stream) => {
        // Contar viewers específicos de este stream (usuarios en la room específica)
        const socketsInStreamRoom = await socket.nsp.in(`stream-${stream.uid}`).fetchSockets();
        const streamSpecificViewers = socketsInStreamRoom.filter((s: any) => !s.isBroadcaster && s.isAutoViewer).length;
        
        return {
          ...stream,
          viewersCount: streamSpecificViewers
        };
      })
    );

    console.log(`📺 Emitiendo lista actualizada: ${streamsWithViewers.length} streams activos con contadores de viewers`);

    // Emitir a TODOS los clientes conectados
    socket.nsp.emit("streams-list", {
      streams: streamsWithViewers,
      count: streamsWithViewers.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error al emitir lista de streams:", error);
  }
};

