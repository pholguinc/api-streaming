import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import { verifyToken, JwtPayload } from "../utils/jwt";
import { prisma } from "../prisma";
import { log } from "console";
// Extender el tipo Socket para incluir la información del usuario autenticado
export interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}
export interface StreamData {
  streamUid: string;
}

export class SocketService {
  private io: SocketIOServer;
  private static instance: SocketService;
  private socketPath: string;
  private activeStreamers: Map<string, { socketId: string; lastHeartbeat: Date; streamUid: string }> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private broadcastTimeout: NodeJS.Timeout | null = null;
  private readonly DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/3541/3541871.png";

  /**
   * Obtiene el avatar del usuario con valor por defecto si es null
   */
  private getUserAvatar(user: JwtPayload | undefined): string {
    return user?.avatar || this.DEFAULT_AVATAR;
  }

  /**
   * Función utilitaria para parsear datos de Socket.IO
   * Maneja tanto objetos como strings JSON, incluyendo JSON con claves sin comillas
   */
  private parseSocketData<T>(data: any, socket: AuthenticatedSocket): T | null {
    try {
      if (typeof data === 'string') {
        // Intentar parsear como JSON normal primero
        try {
          return JSON.parse(data) as T;
        } catch (jsonError) {
          // Si falla, intentar arreglar claves sin comillas
          console.log("🔧 Intentando arreglar JSON con claves sin comillas...");

          // Reemplazar claves sin comillas por claves con comillas
          const fixedJson = data.replace(/(\w+):/g, '"$1":');
          console.log("🔧 JSON corregido:", fixedJson);

          return JSON.parse(fixedJson) as T;
        }
      }
      return data as T;
    } catch (error) {
      console.error("❌ Error al parsear datos:", error);
      console.error("❌ Datos originales:", data);
      socket.emit("error", { message: "Formato de datos inválido" });
      return null;
    }
  }

  private constructor(httpServer: HTTPServer, path?: string) {
    this.socketPath = path || "/socket.io";

    this.io = new SocketIOServer(httpServer, {
      path: this.socketPath,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.setupAuthMiddleware();
    this.initializeSocketEvents();
    this.startHeartbeatMonitoring();
  }

  public static getInstance(
    httpServer?: HTTPServer,
    path?: string
  ): SocketService {
    if (!SocketService.instance && httpServer) {
      SocketService.instance = new SocketService(httpServer, path);
    }
    return SocketService.instance;
  }

  public getPath(): string {
    return this.socketPath;
  }

  /**
   * Limpia recursos al destruir la instancia
   */
  public destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.broadcastTimeout) {
      clearTimeout(this.broadcastTimeout);
      this.broadcastTimeout = null;
    }
    this.activeStreamers.clear();
    console.log("🧹 SocketService destruido - recursos limpiados");
  }

  /**
   * Inicia el monitoreo de heartbeat para detectar streamers desconectados
   */
  private startHeartbeatMonitoring(): void {
    // DESHABILITADO: Solo usar detección TCP de desconexión
    // No verificar inactividad, solo conexiones perdidas
    console.log("💓 Sistema de heartbeat iniciado - Solo detección de desconexión TCP");
  }

  /**
   * Verifica solo sockets desconectados (no por inactividad)
   */
  private async checkDisconnectedStreamers(): Promise<void> {
    for (const [streamUid, streamerInfo] of this.activeStreamers.entries()) {
      // Solo verificar que el socket realmente existe y está conectado
      const socket = this.io.sockets.sockets.get(streamerInfo.socketId);
      if (!socket || !socket.connected) {
        console.log(`⚠️ Socket desconectado detectado: ${streamUid} (socket: ${streamerInfo.socketId})`);
        await this.cleanupOrphanedStream(streamUid, streamerInfo.socketId);
      }
    }
  }

  /**
   * Limpia un stream huérfano (streamer desconectado abruptamente)
   */
  private async cleanupOrphanedStream(streamUid: string, socketId: string): Promise<void> {
    try {
      // Remover del tracking
      this.activeStreamers.delete(streamUid);

      // Actualizar estado en BD
      await prisma.stream.update({
        where: { uid: streamUid },
        data: { status: "offline" },
      });

      // Notificar a todos que el stream terminó por desconexión TCP
      this.io.emit("stream_ended", {
        streamUid,
        message: "Stream finalizado: conexión TCP perdida",
        reason: "tcp_disconnection"
      });

      console.log(`🧹 Stream huérfano limpiado: ${streamUid} (socket: ${socketId})`);

      // Actualizar lista de streams
      this.scheduleBroadcastUpdate();
    } catch (error) {
      console.error(`❌ Error al limpiar stream huérfano ${streamUid}:`, error);
    }
  }

  /**
   * Registra un streamer activo para monitoreo (solo tracking de conexión)
   */
  private registerActiveStreamer(socketId: string, streamUid: string): void {
    this.activeStreamers.set(streamUid, {
      socketId,
      lastHeartbeat: new Date(),
      streamUid
    });
    console.log(`📝 Streamer registrado para tracking de conexión: ${streamUid} (socket: ${socketId})`);
  }

  /**
   * Actualiza el heartbeat de un streamer
   */
  private updateStreamerHeartbeat(streamUid: string): void {
    const streamerInfo = this.activeStreamers.get(streamUid);
    if (streamerInfo) {
      streamerInfo.lastHeartbeat = new Date();
    }
  }

  /**
   * Remueve un streamer del monitoreo
   */
  private unregisterActiveStreamer(streamUid: string): void {
    this.activeStreamers.delete(streamUid);
    console.log(`📝 Streamer removido del monitoreo: ${streamUid}`);
  }

  /**
   * Middleware de autenticación para Socket.IO
   * Valida el token JWT durante el handshake
   */
  private setupAuthMiddleware(): void {
    this.io.use((socket: AuthenticatedSocket, next) => {
      try {
        // Obtener el token desde el handshake (query params o auth)
        const token =
          socket.handshake.auth.token ||
          (socket.handshake.query.token as string);

        if (!token) {
          return next(new Error("Token de autenticación requerido"));
        }

        // Verificar y decodificar el token
        const decoded = verifyToken(token);

        // Adjuntar la información del usuario al socket
        socket.user = decoded;

        console.log(
          `🔐 Usuario autenticado: ${decoded.displayName} (@${decoded.metroUsername}) | Rol: ${decoded.role}`
        );
        next();
      } catch (error) {
        console.error("❌ Error de autenticación:", error);
        next(new Error("Token inválido o expirado"));
      }
    });
  }

  private initializeSocketEvents(): void {
    this.io.on("connection", async (socket: AuthenticatedSocket) => {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🎉 CONEXIÓN EXITOSA - Socket conectado correctamente`);
      console.log(`   🆔 Socket ID: ${socket.id}`);
      console.log(`   👤 Usuario: ${socket.user?.displayName}`);
      console.log(`   📧 Username: @${socket.user?.metroUsername}`);
      console.log(`   🎭 Rol: ${socket.user?.role}`);
      console.log(`   ⏰ Hora: ${new Date().toISOString()}`);
      console.log(`${"=".repeat(60)}\n`);

      // === FLUJO SIMPLIFICADO ===

      // 1. Enviar información del usuario conectado
      this.sendUserInfo(socket);

      // 2. Enviar lista inicial de streams (sin unirse automáticamente a nada)
      await this.sendInitialStreamsList(socket);

      // 3. Manejar eventos específicos según el rol
      this.setupRoleBasedEvents(socket);

      // 3. Configurar detección automática de actividad
      this.setupActivityDetection(socket);

      socket.on("disconnect", async () => {
        console.log(`❌ Cliente desconectado: ${socket.id}`);
        await this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Configura eventos basados en el rol del usuario
   */
  private setupRoleBasedEvents(socket: AuthenticatedSocket): void {
    const user = socket.user!;

    // === EVENTOS PARA TODOS LOS USUARIOS ===

    // Ver un live específico
    socket.on("watch_live", async (stream_data: StreamData) => {
      await this.handleWatchLive(socket, stream_data);
    });

    // Dejar de ver un live
    socket.on("stop_watching", async (stream_data: StreamData) => {
      await this.handleStopWatching(socket, stream_data);
    });

    // Obtener lista de streams (refresh)
    socket.on("get_streams", async () => {
      await this.sendInitialStreamsList(socket);
    });

    // === EVENTOS DE CHAT PARA TODOS LOS USUARIOS ===

    // Enviar mensaje al chat del stream
    socket.on("send-message", async (data: any) => {
      await this.handleSendMessage(socket, data);
    });

    // Notificar que está escribiendo
    socket.on("typing", (data: { streamUid: string; isTyping: boolean }) => {
      this.handleTyping(socket, data);
    });

    // === EVENTOS SOLO PARA METRO_STREAMER ===
    if (user.role === "metro_streamer") {
      // Iniciar transmisión
      socket.on("start_streaming", async (streamData: StreamData) => {
        await this.handleStartStreaming(socket, streamData);
      });

      // Finalizar transmisión
      socket.on("end_streaming", async (stream_data: StreamData) => {
        await this.handleEndStreaming(socket, stream_data);
      });


      // // Datos del stream (video/audio)
      // socket.on("stream_data", async (data: any) => {
      //   await this.handleStreamData(socket, data);
      // });
    }
  }

  /**
   * Configura detección de conexión (sin heartbeat por inactividad)
   */
  private setupActivityDetection(socket: AuthenticatedSocket): void {
    // DESHABILITADO: No hay detección de actividad
    // Solo se maneja la desconexión TCP automáticamente
    console.log(`🔌 Socket configurado para detección solo de desconexión TCP: ${socket.id}`);
  }

  /**
   * Maneja cuando un usuario quiere ver un live específico
   */
  private async handleWatchLive(
    socket: AuthenticatedSocket,
    stream_data: string | object
  ): Promise<void> {
    try {
      const parsedData = this.parseSocketData<StreamData>(stream_data, socket);
      if (!parsedData) {
        return; // Error ya manejado en parseSocketData
      }

      const { streamUid } = parsedData;
      // Verificar que el stream existe y está activo
      const stream = await prisma.stream.findFirst({
        where: { uid: streamUid, status: "active" },
      });

      if (!stream) {
        socket.emit("error", { message: "El stream no está disponible" });
        return;
      }

      // Unirse SOLO a la room de este stream específico
      socket.join(`stream-${streamUid}`);
      (socket as any).watchingStream = streamUid;
      (socket as any).isAutoViewer = true;

      console.log(
        `👀 ${socket.user?.displayName} está viendo el stream: ${streamUid}`
      );

      // Notificar automáticamente al streamer sobre el nuevo viewer
      console.log(`🔍 DEBUG: Llamando notifyStreamerAboutViewers para JOIN`);
      await this.notifyStreamerAboutViewers(streamUid, 'joined', {
        id: socket.user?.id,
        displayName: socket.user?.displayName,
        metroUsername: socket.user?.metroUsername,
        role: socket.user?.role,
        avatar: this.getUserAvatar(socket.user),
        socketId: socket.id
      });

      // Actualizar contadores para todos
      this.scheduleBroadcastUpdate();
    } catch (error) {
      console.error("❌ Error en watch_live:", error);
      socket.emit("error", { message: "Error al unirse al stream" });
    }
  }

  /**
   * Maneja cuando un usuario deja de ver un live
   */
  private async handleStopWatching(
    socket: AuthenticatedSocket,
    stream_data: string | object
  ): Promise<void> {
    const parsedData = this.parseSocketData<StreamData>(stream_data, socket);
    if (!parsedData) {
      return; // Error ya manejado en parseSocketData
    }
    const { streamUid } = parsedData;

    socket.leave(`stream-${streamUid}`);
    delete (socket as any).watchingStream;
    delete (socket as any).isAutoViewer;

    console.log(`🚪 ${socket.user?.displayName} dejó de ver: ${streamUid}`);

    // Notificar automáticamente al streamer sobre el viewer que se fue
    console.log(`🔍 DEBUG: Llamando notifyStreamerAboutViewers para LEAVE`);
    await this.notifyStreamerAboutViewers(streamUid, 'left', {
      id: socket.user?.id,
      displayName: socket.user?.displayName,
      metroUsername: socket.user?.metroUsername,
      role: socket.user?.role,
      avatar: this.getUserAvatar(socket.user),
      socketId: socket.id
    });

    // Actualizar contadores
    this.scheduleBroadcastUpdate();
  }

  /**
   * Maneja cuando un metro_streamer inicia transmisión
   */
  private async handleStartStreaming(
    socket: AuthenticatedSocket,
    streamData: StreamData | string
  ): Promise<void> {
    try {
      const parsedData = this.parseSocketData<StreamData>(streamData, socket);
      if (!parsedData) {
        return; // Error ya manejado en parseSocketData
      }

      const { streamUid } = parsedData;
      const stream = await prisma.stream.findFirst({
        where: { uid: streamUid, userId: socket.user?.id },
      });

      if (!stream) {
        socket.emit("error", { message: "Stream no encontrado o no tienes permisos" });
        return;
      }

      // Actualizar estado en BD
      await prisma.stream.update({
        where: { uid: streamUid },
        data: { status: "active" },
      });

      // Marcar socket como broadcaster
      (socket as any).isBroadcaster = true;
      (socket as any).streamUid = streamUid;

      console.log(`🔍 DEBUG: Streamer marcado como broadcaster:`, {
        socketId: socket.id,
        streamUid: streamUid,
        isBroadcaster: (socket as any).isBroadcaster,
        user: socket.user?.displayName
      });

      // Unirse a su propia room de stream
      socket.join(`stream-${streamUid}`);

      // Registrar para monitoreo de heartbeat
      this.registerActiveStreamer(socket.id, streamUid);

      console.log(`🎥 ${socket.user?.displayName} inició stream: ${streamUid}`);

      // Notificar a TODOS que hay un nuevo stream
      this.scheduleBroadcastUpdate();

      socket.emit("stream_started", { streamUid: streamUid, status: "true" });
    } catch (error) {
      console.error("❌ Error en start_streaming:", error);
      socket.emit("error", { message: "Error al iniciar stream" });
    }
  }

  /**
   * Maneja cuando un metro_streamer finaliza transmisión
   */
  private async handleEndStreaming(
    socket: AuthenticatedSocket,
    stream_data: StreamData | string
  ): Promise<void> {
    try {
      const parsedData = this.parseSocketData<StreamData>(stream_data, socket);
      if (!parsedData) {
        return; // Error ya manejado en parseSocketData
      }
      const { streamUid } = parsedData;

      await prisma.stream.findFirst({
        where: { uid: streamUid, userId: socket.user?.id },
      });

      // Actualizar estado en BD
      await prisma.stream.update({
        where: { uid: streamUid },
        data: { status: "offline" },
      });

      // Limpiar flags
      delete (socket as any).isBroadcaster;
      delete (socket as any).streamUid;

      // Remover del monitoreo de heartbeat
      this.unregisterActiveStreamer(streamUid);

      // Notificar a TODOS que el stream terminó
      this.io.emit("stream_ended", {
        streamUid: streamUid,
        message: `Stream finalizado por ${socket.user?.displayName}`,
        reason: "manual",
        status: "false"
      });

      console.log(
        `🛑 ${socket.user?.displayName} finalizó stream: ${streamUid}`
      );

      // Actualizar lista de streams
      this.scheduleBroadcastUpdate();
    } catch (error) {
      console.error("❌ Error en end_streaming:", error);
      socket.emit("error", { message: "Error al finalizar stream" });
    }
  }


  /**
   * Actualiza el heartbeat de un streamer (solo para tracking interno)
   */
  private updateStreamerHeartbeatFromActivity(socket: AuthenticatedSocket): void {
    const streamUid = (socket as any).streamUid;
    if (streamUid && (socket as any).isBroadcaster) {
      this.updateStreamerHeartbeat(streamUid);
    }
  }

  /**
   * Notifica automáticamente al streamer sobre cambios en sus viewers
   */
  private async notifyStreamerAboutViewers(streamUid: string, action: 'joined' | 'left', viewerInfo?: any): Promise<void> {
    try {
      console.log(`🔍 DEBUG: Iniciando notificación para stream ${streamUid}, acción: ${action}`);
      console.log(`🔍 DEBUG: Viewer info:`, viewerInfo);

      // Obtener todos los sockets conectados a la room del stream
      const socketsInRoom = await this.io
        .in(`stream-${streamUid}`)
        .fetchSockets();

      console.log(`🔍 DEBUG: Sockets en room stream-${streamUid}:`, socketsInRoom.length);
      socketsInRoom.forEach((socket: any, index) => {
        console.log(`🔍 DEBUG: Socket ${index}:`, {
          id: socket.id,
          isBroadcaster: socket.isBroadcaster,
          isAutoViewer: socket.isAutoViewer,
          user: socket.user?.displayName,
          watchingStream: socket.watchingStream
        });
      });

      // Filtrar solo los viewers (excluir al broadcaster)
      const currentViewers = socketsInRoom
        .filter((s: any) => !s.isBroadcaster && s.isAutoViewer)
        .map((s: any) => ({
          id: s.user?.id,
          displayName: s.user?.displayName,
          metroUsername: s.user?.metroUsername,
          role: s.user?.role,
          avatar: this.getUserAvatar(s.user),
          socketId: s.id
        }));

      console.log(`🔍 DEBUG: Viewers filtrados:`, currentViewers);

      // Encontrar el socket del streamer para notificarle
      const streamerSocket = socketsInRoom.find((s: any) => s.isBroadcaster);

      console.log(`🔍 DEBUG: Streamer socket encontrado:`, streamerSocket ? {
        id: streamerSocket.id,
        user: (streamerSocket as any).user?.displayName,
        isBroadcaster: (streamerSocket as any).isBroadcaster
      } : 'NO ENCONTRADO');

      if (streamerSocket) {
        const notification = {
          streamUid,
          action, // 'joined' o 'left'
          viewer: viewerInfo, // Info del viewer que se unió/salió (opcional)
          currentViewers,
          totalCount: currentViewers.length,
          timestamp: new Date().toISOString()
        };

        console.log(`📢 EMITIENDO viewer_update a streamer:`, {
          streamerId: streamerSocket.id,
          streamerName: (streamerSocket as any).user?.displayName,
          notification: notification
        });

        streamerSocket.emit("viewer_update", notification);
        console.log(`✅ viewer_update enviado exitosamente`);
      } else {
        console.log(`❌ No se encontró socket del streamer para ${streamUid}`);
      }
    } catch (error) {
      console.error(`❌ Error al notificar streamer sobre viewers:`, error);
    }
  }

  /**
   * Maneja desconexión - versión simplificada
   * NOTA: NO auto-termina streams RTMPS. Solo limpia tracking local.
   * Los streams solo se terminan cuando el usuario emite end_streaming explícitamente.
   */
  private async handleDisconnect(socket: AuthenticatedSocket): Promise<void> {
    const streamUid = (socket as any).streamUid;
    const isBroadcaster = (socket as any).isBroadcaster;

    // Si era broadcaster, solo limpiar tracking pero NO cambiar estado en BD
    // El stream RTMPS sigue activo en Cloudflare aunque la app se cierre
    if (streamUid && isBroadcaster) {
      console.log(
        `⚠️ STREAMER DESCONECTADO (socket cerrado) - Stream: ${streamUid} | Usuario: ${socket.user?.displayName}`
      );
      console.log(`ℹ️ Stream RTMPS sigue activo en Cloudflare. NO se marca como offline.`);
      console.log(`ℹ️ El usuario debe emitir end_streaming para terminar el stream.`);

      try {
        // Solo remover del tracking local, NO cambiar estado en BD
        this.unregisterActiveStreamer(streamUid);

        // NO emitir stream_ended - el stream sigue activo
        // NO cambiar status en BD - el stream sigue activo en Cloudflare

        console.log(`� Tracking local limpiado. Stream ${streamUid} sigue ACTIVO en BD.`);
      } catch (error) {
        console.error("❌ Error al limpiar tracking en disconnect:", error);
      }
    }

    // Actualizar contadores (si estaba viendo algún stream)
    const watchingStream = (socket as any).watchingStream;
    if (watchingStream) {
      console.log(
        `👀 VIEWER DESCONECTADO - Removiendo de stream: ${watchingStream} | Usuario: ${socket.user?.displayName}`
      );

      // Notificar automáticamente al streamer sobre la desconexión del viewer
      console.log(`🔍 DEBUG: Llamando notifyStreamerAboutViewers para DISCONNECT`);
      await this.notifyStreamerAboutViewers(watchingStream, 'left', {
        id: socket.user?.id,
        displayName: socket.user?.displayName,
        metroUsername: socket.user?.metroUsername,
        role: socket.user?.role,
        avatar: this.getUserAvatar(socket.user),
        socketId: socket.id,
        reason: 'disconnected' // Marcar como desconexión abrupta
      });

      delete (socket as any).watchingStream;
      delete (socket as any).isAutoViewer;

      // ✅ ACTUALIZAR CONTADORES AUTOMÁTICAMENTE
      console.log(`🔍 DEBUG: Llamando scheduleBroadcastUpdate desde disconnect`);
      this.scheduleBroadcastUpdate();
      console.log(`✅ Contadores de viewers actualizados automáticamente`);
    }
  }

  /**
   * Envía información del usuario conectado
   */
  private sendUserInfo(socket: AuthenticatedSocket): void {
    try {
      const userInfo = {
        id: socket.user?.id,
        displayName: socket.user?.displayName,
        metroUsername: socket.user?.metroUsername,
        role: socket.user?.role,
        avatar: this.getUserAvatar(socket.user),
        socketId: socket.id,
        connectedAt: new Date().toISOString()
      };

      console.log(`👤 Enviando información del usuario: ${socket.user?.displayName}`);
      socket.emit("user-info", userInfo);
      console.log(`✅ user-info enviado exitosamente`);
    } catch (error) {
      console.error("❌ Error al enviar información del usuario:", error);
    }
  }

  /**
   * Envía lista de streams - versión simplificada
   */
  private async sendInitialStreamsList(
    socket: AuthenticatedSocket
  ): Promise<void> {
    try {
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
        } as any,
      });

      // Agregar contador REAL de viewers y avatar del streamer
      const streamsWithViewers = await Promise.all(
        activeStreams.map(async (stream: typeof activeStreams[number]) => {
          const socketsInRoom = await this.io
            .in(`stream-${stream.uid}`)
            .fetchSockets();
          const viewersCount = socketsInRoom.filter(
            (s) =>
              !(s as any).isBroadcaster &&
              (s as any).watchingStream === stream.uid
          ).length;

          // Obtener el streamer activo para su avatar
          const streamerSocket = socketsInRoom.find((s: any) => s.isBroadcaster);
          const streamerAvatar = streamerSocket ? this.getUserAvatar((streamerSocket as any).user) : this.DEFAULT_AVATAR;

          return {
            ...stream,
            viewersCount,
            streamerAvatar, // ✅ Avatar del streamer
          };
        })
      );

      socket.emit("streams-list", {
        streams: streamsWithViewers,
        count: streamsWithViewers.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Error al enviar lista inicial:", error);
    }
  }

  /**
   * Emite streams-list con debounce para evitar duplicaciones
   */
  private scheduleBroadcastUpdate(): void {
    console.log(`🔍 DEBUG: scheduleBroadcastUpdate llamado`);
    if (this.broadcastTimeout) {
      clearTimeout(this.broadcastTimeout);
      console.log(`🔍 DEBUG: Timeout anterior cancelado`);
    }

    this.broadcastTimeout = setTimeout(async () => {
      console.log(`🔍 DEBUG: Ejecutando broadcastUpdatedStreamsList después del timeout`);
      await this.broadcastUpdatedStreamsList();
    }, 100); // 100ms de debounce
    console.log(`🔍 DEBUG: Nuevo timeout programado para 100ms`);
  }

  private async broadcastUpdatedStreamsList(): Promise<void> {
    try {
      console.log(`🔄 Emitiendo streams-list a todos los clientes...`);

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
          updatedAt: true,
        } as any,
      });

      // Agregar contador de viewers específico y avatar del streamer
      const streamsWithViewers = await Promise.all(
        activeStreams.map(async (stream: typeof activeStreams[number]) => {
          // Contar viewers específicos de este stream (usuarios en la room específica)
          const socketsInStreamRoom = await this.io
            .in(`stream-${stream.uid}`)
            .fetchSockets();
          const streamSpecificViewers = socketsInStreamRoom.filter(
            (s: any) => !s.isBroadcaster && s.isAutoViewer
          ).length;

          // Obtener el streamer activo para su avatar
          const streamerSocket = socketsInStreamRoom.find((s: any) => s.isBroadcaster);
          const streamerAvatar = streamerSocket ? this.getUserAvatar((streamerSocket as any).user) : this.DEFAULT_AVATAR;

          return {
            ...stream,
            viewersCount: streamSpecificViewers,
            streamerAvatar, // ✅ Avatar del streamer
          };
        })
      );

      console.log(
        `🔄 ACTUALIZANDO CONTADORES: ${streamsWithViewers.length} streams con ${streamsWithViewers[0]?.viewersCount || 0
        } viewers`
      );

      // Emitir a TODOS los clientes conectados
      this.io.emit("streams-list", {
        streams: streamsWithViewers,
        count: streamsWithViewers.length,
        timestamp: new Date().toISOString(),
        isViewerCountUpdate: true, // Flag para indicar que es actualización de contadores
      });
    } catch (error) {
      console.error("❌ Error al emitir lista actualizada de streams:", error);
    }
  }

  /**
   * Maneja el envío de mensajes de chat
   */
  private async handleSendMessage(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      console.log("🔍 DEBUG: Datos recibidos en handleSendMessage:", { data, type: typeof data });

      // Parsear data usando la función utilitaria existente
      const parsedData = this.parseSocketData<{ streamUid: string; message: string }>(data, socket);
      if (!parsedData) {
        return; // Error ya manejado en parseSocketData
      }

      const { streamUid, message } = parsedData;

      // Validaciones adicionales
      if (!streamUid || typeof streamUid !== 'string') {
        console.log("❌ streamUid inválido detectado:", { streamUid, type: typeof streamUid });
        socket.emit("error", {
          event: "send-message",
          message: "ID de stream inválido"
        });
        return;
      }

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
        streamUid,
        user: {
          id: socket.user?.id,
          displayName: isBroadcaster ? `${socket.user?.displayName} (Anfitrión)` : socket.user?.displayName,
          metroUsername: socket.user?.metroUsername,
          role: socket.user?.role,
          avatar: this.getUserAvatar(socket.user),
        },
        message: message.trim(),
        timestamp: new Date().toISOString(),
      };

      // Emitir a TODOS en el stream (incluyendo al emisor)
      // Usar io.in() para incluir al emisor también
      // Verificar cuántos sockets están en la room antes de emitir
      const socketsInRoom = await this.io.in(`stream-${streamUid}`).fetchSockets();
      console.log(`📢 Emitiendo new-message a room stream-${streamUid} para usuario: ${socket.user?.displayName}`);
      console.log(`📊 Sockets en room: ${socketsInRoom.length}`, socketsInRoom.map(s => s.id));

      this.io.in(`stream-${streamUid}`).emit("new-message", messageData);
      console.log(`✅ new-message emitido exitosamente`);

    } catch (error) {
      console.error("❌ Error al enviar mensaje:", error);
      socket.emit("error", {
        event: "send-message",
        message: "Error al enviar el mensaje"
      });
    }
  }

  /**
   * Maneja el evento de typing
   */
  private handleTyping(socket: AuthenticatedSocket, data: { streamUid: string; isTyping: boolean }): void {
    try {
      const { streamUid, isTyping } = data;

      socket.to(`stream-${streamUid}`).emit("user-typing", {
        user: {
          id: socket.user?.id,
          displayName: socket.user?.displayName,
          metroUsername: socket.user?.metroUsername,
          avatar: this.getUserAvatar(socket.user),
        },
        isTyping,
      });

    } catch (error) {
      console.error("❌ Error en typing:", error);
    }
  }
}
