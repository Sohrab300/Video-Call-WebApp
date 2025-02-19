// utils/getEmbedding.js
const AbortController = require('abort-controller');

async function getEmbedding(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000); // 20-second timeout

  try {
    const response = await fetch("https://fastapi-embedding.onrender.com/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
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
