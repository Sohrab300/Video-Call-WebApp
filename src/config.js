export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://my-backend-service-257606194123.us-central1.run.app";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function parseIceServers(rawIceServers) {
  if (!rawIceServers) return DEFAULT_ICE_SERVERS;

  try {
    const parsed = JSON.parse(rawIceServers);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_ICE_SERVERS;
  } catch (error) {
    console.error("Invalid VITE_ICE_SERVERS JSON:", error);
    return DEFAULT_ICE_SERVERS;
  }
}

export const ICE_SERVERS = parseIceServers(import.meta.env.VITE_ICE_SERVERS);
