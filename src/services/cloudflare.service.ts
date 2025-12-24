import axios from "axios";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
const apiToken = process.env.CLOUDFLARE_API_TOKEN!;

// Base URLs
const liveInputsURL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`;

// Cliente principal para Cloudflare Stream
const api = axios.create({
  headers: {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  },
});

/* -------------------------------------------------- */
/* 🎥 LIVE INPUTS                                     */
/* -------------------------------------------------- */

// Crear un nuevo live input
export const createLiveInput = async (name: string) => {
  const res = await api.post(liveInputsURL, {
    meta: { name },
    recording: { mode: "automatic" },
    deleteRecordingAfterDays: 30,
    preferLowLatency: true,
  });
  return res.data;
};

// Obtener un live input específico
export const getLiveInputByUid = async (uid: string) => {
  const res = await api.get(`${liveInputsURL}/${uid}`);
  return res.data;
};

// Listar todos los live inputs
export const getLiveInputs = async () => {
  const res = await api.get(liveInputsURL);
  return res.data;
};

// Eliminar un live input
export const deleteLiveInput = async (uid: string) => {
  const res = await api.delete(`${liveInputsURL}/${uid}`);
  return res.data;
};
