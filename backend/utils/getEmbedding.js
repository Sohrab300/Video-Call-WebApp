// utils/getEmbedding.js
const AbortController = require('abort-controller');

const EMBEDDING_SERVICE_URL =
  process.env.EMBEDDING_SERVICE_URL ||
  'https://fastembed-service-257606194123.us-central1.run.app';
const EMBEDDING_TIMEOUT_MS = Number(process.env.EMBEDDING_TIMEOUT_MS || 60000);

async function getEmbedding(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Embedding service returned an error:", {
        status: response.status,
        body: errorBody,
      });
      return null;
    }

    const data = await response.json();
    if (data.error) {
      console.error("Embedding service error:", data.error);
      return null;
    }
    return data.embedding;
  } catch (error) {
    console.error("Error fetching embedding:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = getEmbedding;
