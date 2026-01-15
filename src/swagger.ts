import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Cloudflare WebRTC Server API",
      version: "1.0.0",
      description: "API para gestionar streams de video en vivo usando Cloudflare WebRTC",
      contact: {
        name: "Soporte API",
        email: "soporte@ejemplo.com",
      },
    },
    servers: [
      {
        url: "https://api-stream.puntossmart.com",
        description: "Servidor de producción",
      },
      {
        url: "http://localhost:9000",
        description: "Servidor de desarrollo",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Token JWT para autenticación. El usuario debe tener el rol 'metro_streamer'",
        },
      },
      schemas: {
        Stream: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "ID único del stream en la base de datos",
              example: 1,
            },
            uid: {
              type: "string",
              description: "UID único del stream en Cloudflare",
              example: "550e8400-e29b-41d4-a716-446655440000",
            },
            title: {
              type: "string",
              description: "Título del stream",
              example: "Mi Transmisión en Vivo",
            },
            userId: {
              type: "integer",
              description: "ID del usuario propietario del stream",
              example: 123,
            },
            status: {
              type: "string",
              description: "Estado actual del stream",
              enum: ["active", "offline", "pending"],
              example: "active",
            },
            preferLowLatency: {
              type: "boolean",
              description: "Preferencia de baja latencia",
              example: true,
            },
            deleteRecordingAfterDays: {
              type: "integer",
              description: "Días después de los cuales se eliminará la grabación",
              example: 30,
            },
            recordingMode: {
              type: "string",
              description: "Modo de grabación",
              example: "automatic",
            },
            webRTCUrl: {
              type: "string",
              description: "URL de WebRTC para transmitir",
              example: "webrtc://live.cloudflare.com/stream/...",
            },
            webRTCPlaybackUrl: {
              type: "string",
              description: "URL de WebRTC para reproducir",
              example: "webrtc://customer.cloudflarestream.com/...",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Fecha de creación del stream",
              example: "2024-10-09T12:00:00.000Z",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Fecha de última actualización",
              example: "2024-10-09T12:00:00.000Z",
            },
          },
        },
        CreateStreamRequest: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Título de la transmisión (opcional)",
              example: "Mi Primera Transmisión",
            },
          },
        },
        CreateStreamResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Stream listo para transmitir",
            },
            id: {
              type: "string",
              description: "UID del stream creado",
              example: "550e8400-e29b-41d4-a716-446655440000",
            },
            title: {
              type: "string",
              description: "Título actual del stream",
              example: "Mi Primera Transmisión",
            },
            username: {
              type: "string",
              description: "Nombre de usuario en Metro",
              example: "usuario123",
            },
            WebRTC: {
              type: "string",
              description: "URL de WebRTC para transmitir (alternativa a RTMPS)",
              example: "https://customer-xxx.cloudflarestream.com/.../webRTC/publish",
            },
            WebRTCPlayback: {
              type: "string",
              description: "URL para que los viewers vean el stream",
              example: "https://customer-xxx.cloudflarestream.com/.../webRTC/play",
            },
            rtmpsServer: {
              type: "string",
              description: "URL del servidor RTMPS para configurar en OBS",
              example: "rtmps://live.cloudflare.com:443/live/",
            },
            rtmpsStreamKey: {
              type: "string",
              description: "Clave de retransmisión para OBS",
              example: "2fb3cb9f17e68a2568d6ebed8d5505ea...",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Mensaje de error",
              example: "Error creando transmisión",
            },
          },
        },
        UnauthorizedError: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Mensaje de error de autorización",
              example: "Usuario no autenticado",
            },
          },
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: [
    "./src/routes/*.ts",
    "./src/controllers/*.ts",
    "./dist/routes/*.js",
    "./dist/controllers/*.js"
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  // Determinar el servidor por defecto basado en el entorno
  const isProduction = process.env.NODE_ENV === 'production' || process.env.HOSTNAME?.includes('puntossmart');
  const defaultServerIndex = isProduction ? 0 : 1;

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Cloudflare WebRTC API Docs",
    swaggerOptions: {
      url: undefined, // Usar el spec inline
      supportedSubmitMethods: ['get', 'post', 'put', 'delete'],
      validatorUrl: null,
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      docExpansion: 'none',
      apisSorter: 'alpha',
      operationsSorter: 'alpha',
      tagsSorter: 'alpha',
      tryItOutEnabled: true,
      requestInterceptor: (req: any) => {
        // Asegurar que las URLs sean absolutas
        if (!req.url.startsWith('http')) {
          const serverUrl = isProduction ? 'https://api-stream.puntossmart.com' : 'http://localhost:9000';
          req.url = serverUrl + req.url;
        }
        return req;
      }
    }
  }));

  app.get("/api-docs.json", (_, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  console.log("📚 Documentación Swagger disponible en http://localhost:9000/api-docs");
};

