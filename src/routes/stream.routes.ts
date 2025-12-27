import { Router } from "express";
import { createStream, allStreams } from "../controllers/stream.controller";
import { authenticate } from "../middlewares/auth.middleware";
//import { authorize } from "../middlewares/authorize.middleware";

const router = Router();

/**
 * @swagger
 * /api/streams:
 *   post:
 *     summary: Crear o actualizar un stream de video
 *     description: |
 *       Crea un nuevo stream en Cloudflare para el usuario autenticado si no existe uno. 
 *       Si el stream ya existe, lo devuelve y actualiza el título si se proporciona uno nuevo.
 *       El stream se vincula automáticamente al usuario y genera URLs de WebRTC para transmitir y reproducir.
 *       
 *       **Comportamiento:**
 *       - Si no existe stream: Crea uno nuevo con el título proporcionado o "Mi Transmisión" por defecto
 *       - Si existe stream sin título en request: Devuelve el stream existente sin cambios
 *       - Si existe stream con título en request: Actualiza el título y devuelve el stream
 *     tags:
 *       - Streams
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateStreamRequest'
 *           examples:
 *             conTitulo:
 *               summary: Con título personalizado
 *               value:
 *                 title: "Mi Transmisión en Vivo"
 *             actualizarTitulo:
 *               summary: Actualizar título de stream existente
 *               value:
 *                 title: "Nuevo Título de Transmisión"
 *             sinTitulo:
 *               summary: Sin título (usa título por defecto o mantiene el existente)
 *               value: {}
 *     responses:
 *       200:
 *         description: Stream creado exitosamente, actualizado o devuelto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateStreamResponse'
 *       401:
 *         description: Usuario no autenticado o sin permisos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Usuario no tiene el rol 'user' requerido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
//router.post("/", authenticate, authorize("user"), createStream);
router.post("/", authenticate, createStream);
/**
 * @swagger
 * /api/streams:
 *   get:
 *     summary: Obtener todos los streams activos
 *     description: Retorna una lista de todos los streams que están actualmente en estado 'active'. Requiere autenticación y rol 'user'.
 *     tags:
 *       - Streams
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de streams activos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Stream'
 *             examples:
 *               ejemplo:
 *                 summary: Ejemplo de respuesta
 *                 value:
 *                   - id: 1
 *                     uid: "550e8400-e29b-41d4-a716-446655440000"
 *                     title: "Mi Transmisión"
 *                     userId: 123
 *                     status: "active"
 *                     preferLowLatency: true
 *                     deleteRecordingAfterDays: 30
 *                     recordingMode: "automatic"
 *                     webRTCUrl: "webrtc://live.cloudflare.com/stream/..."
 *                     webRTCPlaybackUrl: "webrtc://customer.cloudflarestream.com/..."
 *                     createdAt: "2024-10-09T12:00:00.000Z"
 *                     updatedAt: "2024-10-09T12:00:00.000Z"
 *       401:
 *         description: Usuario no autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Usuario no tiene el rol 'user' requerido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", authenticate, allStreams);

// router.get("/:uid", getStream);
// router.delete("/:uid", deleteStream);

export default router;
