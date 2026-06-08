require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const crypto = require("crypto");
const sequelize = require("./database");
const { Op } = require("sequelize");
const getEmbedding = require("./utils/getEmbedding");

const Interest = require("./models/Interest");
const interestsRouter = require("./routes/interests");
const rateLimit = require("express-rate-limit");

const app = express();
const shouldResetDb = process.env.DB_SYNC_FORCE === "true";
const embeddingWarmupCooldownMs = Number(
  process.env.EMBEDDING_WARMUP_COOLDOWN_MS || 10 * 60 * 1000
);
let embeddingWarmupPromise = null;
let lastEmbeddingWarmupAt = 0;
const deniedManualRequests = new Set();
const manualMatchRequests = new Map();
const MAX_INTEREST_LENGTH = Number(process.env.MAX_INTEREST_LENGTH || 160);
const MAX_CHAT_MESSAGE_LENGTH = Number(
  process.env.MAX_CHAT_MESSAGE_LENGTH || 1000
);
const MANUAL_REQUEST_TTL_MS = Number(
  process.env.MANUAL_REQUEST_TTL_MS || 30 * 1000
);
const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD || 0.4);
const CALL_DISCONNECT_GRACE_MS = Number(
  process.env.CALL_DISCONNECT_GRACE_MS || 20 * 1000
);
const pendingCallDisconnects = new Map();

function manualRequestKey(requesterSocketId, targetSocketId) {
  return `${requesterSocketId}->${targetSocketId}`;
}

function makeRoomId() {
  return `room-${Date.now()}-${crypto.randomUUID()}`;
}

function normalizeInterestInput(value) {
  if (typeof value !== "string") {
    return { error: "Interest must be text." };
  }

  const interest = value.trim();
  if (!interest) {
    return { error: "Enter an interest before submitting." };
  }
  if (interest.length > MAX_INTEREST_LENGTH) {
    return {
      error: `Interest must be ${MAX_INTEREST_LENGTH} characters or fewer.`,
    };
  }

  return { interest };
}

function deleteManualRequestsForSocket(socketId) {
  for (const [token, request] of manualMatchRequests) {
    if (
      request.requesterSocketId === socketId ||
      request.targetSocketId === socketId
    ) {
      manualMatchRequests.delete(token);
    }
  }
}

function deleteDeniedRequestsForSocket(socketId) {
  for (const key of deniedManualRequests) {
    if (key.startsWith(`${socketId}->`) || key.endsWith(`->${socketId}`)) {
      deniedManualRequests.delete(key);
    }
  }
}

async function cleanupDisconnectedSocket(socketId, callRooms = []) {
  deleteDeniedRequestsForSocket(socketId);
  deleteManualRequestsForSocket(socketId);

  try {
    await Promise.all(
      callRooms.map((roomId) =>
        Interest.update(
          { matched: false, roomId: null },
          {
            where: {
              roomId,
              socketId: { [Op.ne]: socketId },
            },
          }
        )
      )
    );
    await Interest.destroy({
      where: { socketId },
    });
    await broadcastActiveList();
  } catch (err) {
    console.error("Error cleaning up interests on disconnect:", err);
  }
}

function cancelPendingCallDisconnect(socketId) {
  const pendingDisconnect = pendingCallDisconnects.get(socketId);
  if (!pendingDisconnect) return false;

  clearTimeout(pendingDisconnect.timer);
  pendingCallDisconnects.delete(socketId);
  return true;
}

function scheduleCallDisconnectCleanup(socketId, callRooms) {
  cancelPendingCallDisconnect(socketId);

  const timer = setTimeout(async () => {
    pendingCallDisconnects.delete(socketId);

    callRooms.forEach((roomId) => {
      io.to(roomId).emit("callEnded", {
        roomId,
        reason: "peerDisconnected",
        peerSocketId: socketId,
      });
    });

    await cleanupDisconnectedSocket(socketId, callRooms);
  }, CALL_DISCONNECT_GRACE_MS);

  pendingCallDisconnects.set(socketId, { timer, callRooms });
}

app.use((req, _res, next) => {
  console.log(`⬇️  ${req.method} ${req.originalUrl}`);
  next();
});

// CORS (allow configured frontend origins)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (!allowedOrigins.length) {
  allowedOrigins.push("http://localhost:5173", "https://sohrab300.github.io");
}
function isAllowedOrigin(incomingOrigin) {
  return !incomingOrigin || allowedOrigins.includes(incomingOrigin);
}
const corsOptions = {
  origin: (incomingOrigin, callback) => {
    if (isAllowedOrigin(incomingOrigin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"), false);
  },
};
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120,
  message: "Too many requests from this IP, please try again after 15 minutes.",
});
app.use(limiter);

app.use(express.json());
app.use("/api/interests", interestsRouter);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: corsOptions,
  connectionStateRecovery: {
    maxDisconnectionDuration: CALL_DISCONNECT_GRACE_MS,
    skipMiddlewares: true,
  },
});

// Make Socket.IO available in `req.app.get('io')`
app.set("io", io);
app.set("manualMatchRequests", manualMatchRequests);
app.set("makeRoomId", makeRoomId);
app.set("broadcastActiveList", broadcastActiveList);

sequelize
  .authenticate()
  .then(() => console.log("PostgreSQL connected"))
  .catch((err) => console.error("PostgreSQL connection error:", err));

sequelize
  .sync({ force: shouldResetDb })
  .then(() => console.log("Sequelize models synchronized"))
  .catch((err) => console.error("Error synchronizing Sequelize models:", err));

// Utility: normalize & cosine similarity
const normalize = (vec) => {
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (!magnitude) return vec;
  return vec.map((val) => val / magnitude);
};
const cosineSimilarity = (vecA, vecB) => {
  const normA = normalize(vecA);
  const normB = normalize(vecB);
  return normA.reduce((sum, a, i) => sum + a * normB[i], 0);
};

// Helper to broadcast current unmatched list
async function broadcastActiveList() {
  try {
    const activeList = await Interest.findAll({
      where: { matched: false },
      attributes: ["id", "socketId", "interest", "createdAt"],
      order: [["createdAt", "ASC"]],
    });
    io.emit("activeListUpdated", activeList);
  } catch (err) {
    console.error("Error broadcasting active list:", err);
  }
}

function warmEmbeddingService(reason) {
  const now = Date.now();
  if (embeddingWarmupPromise) return embeddingWarmupPromise;
  if (now - lastEmbeddingWarmupAt < embeddingWarmupCooldownMs) {
    return Promise.resolve();
  }

  console.log(`Warming embedding service (${reason})...`);
  embeddingWarmupPromise = getEmbedding("warm up request")
    .then((embedding) => {
      if (embedding) {
        lastEmbeddingWarmupAt = Date.now();
        console.log("Embedding service warm-up completed");
      } else {
        console.warn("Embedding service warm-up did not complete");
      }
    })
    .catch((err) => {
      console.error("Embedding service warm-up error:", err);
    })
    .finally(() => {
      embeddingWarmupPromise = null;
    });

  return embeddingWarmupPromise;
}

io.on("connection", (socket) => {
  const recoveredCall = socket.recovered && cancelPendingCallDisconnect(socket.id);
  console.log("New client connected:", socket.id, {
    recovered: socket.recovered,
    recoveredCall,
  });
  warmEmbeddingService("client connected");

  // Send current active list immediately
  (async () => {
    const activeList = await Interest.findAll({
      where: { matched: false },
      attributes: ["id", "socketId", "interest", "createdAt"],
      order: [["createdAt", "ASC"]],
    });
    socket.emit("activeListUpdated", activeList);
  })();

  // Relay connection requests from A to B.
  socket.on(
    "connectionRequest",
    async ({ targetSocketId }) => {
      const blockedKey = manualRequestKey(socket.id, targetSocketId);
      if (deniedManualRequests.has(blockedKey)) {
        socket.emit("manualRequestBlocked", { targetSocketId });
        return;
      }

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (!targetSocket) {
        socket.emit("manualRequestUnavailable", { targetSocketId });
        return;
      }

      let requesterInterest;
      let targetInterest;
      try {
        [requesterInterest, targetInterest] = await Promise.all([
          Interest.findOne({
            where: { socketId: socket.id, matched: false },
          }),
          Interest.findOne({
            where: { socketId: targetSocketId, matched: false },
          }),
        ]);
      } catch (err) {
        console.error("Error validating connection request:", err);
        socket.emit("manualRequestUnavailable", { targetSocketId });
        return;
      }

      if (!requesterInterest || !targetInterest) {
        socket.emit("manualRequestUnavailable", { targetSocketId });
        return;
      }

      const requestToken = crypto.randomUUID();
      const expiresAt = Date.now() + MANUAL_REQUEST_TTL_MS;
      manualMatchRequests.set(requestToken, {
        requesterSocketId: socket.id,
        targetSocketId,
        requesterInterestId: requesterInterest.id,
        targetInterestId: targetInterest.id,
        expiresAt,
      });

      setTimeout(() => {
        const request = manualMatchRequests.get(requestToken);
        if (request && request.expiresAt <= Date.now()) {
          manualMatchRequests.delete(requestToken);
        }
      }, MANUAL_REQUEST_TTL_MS + 1000);

      socket.to(targetSocketId).emit("incomingRequest", {
        fromSocketId: socket.id,
        requestToken,
        requesterInterestId: requesterInterest.id,
        targetInterestId: targetInterest.id,
        interest: requesterInterest.interest,
      });
    }
  );

  // Relay denials from B to A. Acceptances are completed through the REST match endpoint.
  socket.on("connectionResponse", ({ targetSocketId, accepted }) => {
    if (!accepted) {
      deniedManualRequests.add(manualRequestKey(targetSocketId, socket.id));
      socket.to(targetSocketId).emit("requestDenied", {
        fromSocketId: socket.id,
      });
    }
  });

  // ─── Handle "submitInterest" ─────────────────────────────────────
  socket.on("submitInterest", async ({ interest }, respond) => {
    const sendSubmitResponse = (payload) => {
      if (typeof respond === "function") respond(payload);
    };

    const normalizedInput = normalizeInterestInput(interest);
    if (normalizedInput.error) {
      const payload = {
        success: false,
        message: normalizedInput.error,
      };
      socket.emit("interestError", payload);
      sendSubmitResponse(payload);
      return;
    }
    interest = normalizedInput.interest;

    console.log(`User ${socket.id} submitted interest: ${interest}`);

    // 1) Generate embedding
    let embedding;
    try {
      embedding = await getEmbedding(interest);
    } catch (err) {
      console.error("Embedding service error:", err);
      const payload = {
        success: false,
        message: "Embedding service error. Please try again.",
      };
      socket.emit("interestError", payload);
      sendSubmitResponse(payload);
      return;
    }
    if (!embedding || !Array.isArray(embedding)) {
      console.error("Failed to generate embedding");
      const payload = {
        success: false,
        message: "Failed to generate embedding. Please submit again.",
      };
      socket.emit("interestError", payload);
      sendSubmitResponse(payload);
      return;
    }

    // 2) Create new interest record
    let newInterest;
    try {
      newInterest = await Interest.create({
        socketId: socket.id,
        interest,
        embedding,
        matched: false,
      });
      console.log("Interest saved:", {
        id: newInterest.id,
        socketId: newInterest.socketId,
        interest: newInterest.interest,
        matched: newInterest.matched,
        roomId: newInterest.roomId,
      });
    } catch (error) {
      console.error("Database error saving interest:", error);
      const payload = {
        success: false,
        message: "Database error. Please try again.",
      };
      socket.emit("interestError", payload);
      sendSubmitResponse(payload);
      return;
    }

    // 3) Acknowledge client of success
    socket.emit("interestAccepted", { interest: newInterest });
    sendSubmitResponse({ success: true, interest: newInterest });

    // 4) Broadcast updated active list to all clients
    broadcastActiveList();

    // 5) Attempt to auto-match
    let unmatched;
    try {
      unmatched = await Interest.findAll({
        where: { matched: false, socketId: { [Op.ne]: socket.id } },
      });
    } catch (err) {
      console.error("Error fetching unmatched interests:", err);
      return;
    }

    if (!unmatched.length) return;

    let bestMatch = null;
    let bestScore = 0;
    unmatched.forEach((rec) => {
      if (!rec.embedding) return;
      const score = cosineSimilarity(embedding, rec.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rec;
      }
    });

    if (bestMatch && bestScore >= MATCH_THRESHOLD) {
      const roomId = makeRoomId();
      let matched = false;
      try {
        await sequelize.transaction(async (transaction) => {
          const [updatedNewCount] = await Interest.update(
            { matched: true, roomId },
            {
              where: { id: newInterest.id, matched: false },
              transaction,
            }
          );
          const [updatedBestCount] = await Interest.update(
            { matched: true, roomId },
            {
              where: { id: bestMatch.id, matched: false },
              transaction,
            }
          );

          if (updatedNewCount !== 1 || updatedBestCount !== 1) {
            throw new Error("Interest was already matched");
          }
          matched = true;
        });
      } catch (err) {
        console.error("Error updating matched interests:", err);
        return;
      }

      if (!matched) return;

      console.log(
        `Match found in room ${roomId}: ${interest} & ${bestMatch.interest}`
      );

      // Join both clients to room
      socket.join(roomId);
      io.to(bestMatch.socketId).socketsJoin(roomId);

      // Notify clients
      socket.emit("matchFound", {
        roomId,
        isInitiator: true,
        peerSocketId: bestMatch.socketId,
      });
      io.to(bestMatch.socketId).emit("matchFound", {
        roomId,
        isInitiator: false,
        peerSocketId: socket.id,
      });

      // Broadcast list again after matching
      broadcastActiveList();
    }
  });

  // ─── WebRTC signaling ─────────────────────────────────────────────
  socket.on("offer", ({ offer, roomId }) => {
    if (socket.rooms.has(roomId)) socket.to(roomId).emit("offer", { offer });
  });
  socket.on("answer", ({ answer, roomId }) => {
    if (socket.rooms.has(roomId)) socket.to(roomId).emit("answer", { answer });
  });
  socket.on("iceCandidate", ({ candidate, roomId }) => {
    if (socket.rooms.has(roomId)) {
      socket.to(roomId).emit("iceCandidate", { candidate });
    }
  });
  socket.on("chatMessage", (data) => {
    if (!data?.roomId || !socket.rooms.has(data.roomId)) return;
    if (typeof data.text !== "string") return;

    const text = data.text.trim();
    if (!text || text.length > MAX_CHAT_MESSAGE_LENGTH) return;

    socket.to(data.roomId).emit("chatMessage", {
      id: data.id,
      roomId: data.roomId,
      text,
      timestamp: data.timestamp,
      sender: socket.id,
    });
  });

  // ─── User count update ─────────────────────────────────────────────
  io.emit("updateUserCount", io.engine.clientsCount);

  socket.on("disconnecting", () => {
    const callRooms = [...socket.rooms].filter((roomId) => roomId !== socket.id);
    socket.data.callRooms = callRooms;
  });

  // ─── Handle disconnect ─────────────────────────────────────────────
  socket.on("disconnect", async (reason) => {
    const callRooms = socket.data.callRooms || [];
    console.log("Client disconnected:", socket.id, {
      reason,
      callRooms,
    });
    io.emit("updateUserCount", io.engine.clientsCount);

    if (callRooms.length) {
      scheduleCallDisconnectCleanup(socket.id, callRooms);
      return;
    }

    await cleanupDisconnectedSocket(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  setTimeout(() => warmEmbeddingService("server started"), 1000);
});
