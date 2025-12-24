import { Request, Response } from "express";
import { createLiveInput, getLiveInputs, deleteLiveInput, getLiveInputByUid } from "../services/cloudflare.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { prisma } from "../prisma";

export const createStream = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }
    const user_id = req.user.id;
    const { title } = req.body;

    let stream = await prisma.stream.findFirst({
      where: { userId: user_id },
    });

    if (!stream) {
      // Crear nuevo stream
      const data = await createLiveInput(user_id);

      stream = await prisma.stream.create({
        data: {
          uid: data.result.uid,
          title: title || "Mi Transmisión",
          userId: user_id,
          status: data.result.status ?? "offline",
          preferLowLatency: data.result.preferLowLatency,
          deleteRecordingAfterDays: data.result.deleteRecordingAfterDays,
          recordingMode: data.result.recording.mode,
          webRTCUrl: data.result.webRTC.url,
          webRTCPlaybackUrl: data.result.webRTCPlayback.url,
          displayName: req.user.displayName,
          metroUsername: req.user.metroUsername,
        },
      });
    } else if (title) {
      // Actualizar título si se proporciona uno nuevo
      stream = await prisma.stream.update({
        where: { uid: stream.uid },
        data: { title },
      });
    }

    res.json({
      message: "Stream listo para transmitir",
      id: stream.uid,
      title: stream.title,
      username: req.user.metroUsername,
      WebRTC: stream.webRTCUrl,
      WebRTCPlayback: stream.webRTCPlaybackUrl
    });
  } catch (error: any) {
    console.error("=== ERROR CREANDO TRANSMISIÓN ===");
    console.error("Error completo:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
    }
    console.error("User info:", req.user);
    console.error("=================================");
    res.status(500).json({ error: "Error creando transmisión", details: error.message });
  }
};

export const allStreams = async (req: Request, res: Response) => {
  try {
    const streams = await prisma.stream.findMany({
      where: { status: "active" },
    });
    res.json(streams);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo transmisiones" });
  }
};

export const getStream = async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    const data = await getLiveInputByUid(uid);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Error obteniendo transmisión" });
  }
};

export const listStreams = async (_req: Request, res: Response) => {
  try {
    const data = await getLiveInputs();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Error obteniendo transmisiones" });
  }
};

export const deleteStream = async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    const data = await deleteLiveInput(uid);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Error eliminando transmisión" });
  }
};
