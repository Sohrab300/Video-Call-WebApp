require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
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

function manualRequestKey(requesterSocketId, targetSocketId) {
  return `${requesterSocketId}->${targetSocketId}`;
}

app.use((req, _res, next) => {
  console.log(`⬇️  ${req.method} ${req.originalUrl}`);
  next();
});

// CORS (allow localhost:5173 and GitHub Pages)
app.options("*", cors());
const allowedOrigins = ["http://localhost:5173", "https://sohrab300.github.io"];
app.use(
  cors({
    origin: (incomingOrigin, callback) => {
      if (!incomingOrigin) return callback(null, true);
      if (allowedOrigins.includes(incomingOrigin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
  })
);

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
const io = socketIo(server, { cors: { origin: "*" } });

// Make Socket.IO available in `req.app.get('io')`
app.set("io", io);

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
  console.log("New client connected:", socket.id);
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
    ({
      targetSocketId,
      requestId,
      requesterInterestId,
      targetInterestId,
      interest,
    }) => {
      const blockedKey = manualRequestKey(socket.id, targetSocketId);
      if (deniedManualRequests.has(blockedKey)) {
        socket.emit("manualRequestBlocked", { targetSocketId });
        return;
      }

      socket.to(targetSocketId).emit("incomingRequest", {
        fromSocketId: socket.id,
        requestId: requesterInterestId || requestId,
        requesterInterestId: requesterInterestId || requestId,
        targetInterestId,
        interest,
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

    const threshold = 0.4;
    if (bestMatch && bestScore >= threshold) {
      const roomId = `${interest}-${Date.now()}`;
      try {
        await Interest.update(
          { matched: true, roomId },
          { where: { id: newInterest.id } }
        );
        await Interest.update(
          { matched: true, roomId },
          { where: { id: bestMatch.id } }
        );
      } catch (err) {
        console.error("Error updating matched interests:", err);
        return;
      }

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
  socket.on("offer", ({ offer, roomId }) =>
    socket.to(roomId).emit("offer", { offer })
  );
  socket.on("answer", ({ answer, roomId }) =>
    socket.to(roomId).emit("answer", { answer })
  );
  socket.on("iceCandidate", ({ candidate, roomId }) =>
    socket.to(roomId).emit("iceCandidate", { candidate })
  );
  socket.on("chatMessage", (data) => {
    socket.to(data.roomId).emit("chatMessage", data);
    if (data.targetSocketId) {
      socket.to(data.targetSocketId).emit("chatMessage", data);
    }
  });

  // ─── User count update ─────────────────────────────────────────────
  io.emit("updateUserCount", io.engine.clientsCount);

  socket.on("disconnecting", () => {
    const callRooms = [...socket.rooms].filter((roomId) => roomId !== socket.id);
    callRooms.forEach((roomId) => {
      socket.to(roomId).emit("callEnded", {
        roomId,
        reason: "peerDisconnected",
        peerSocketId: socket.id,
      });
    });
  });

  // ─── Handle disconnect ─────────────────────────────────────────────
  socket.on("disconnect", async () => {
    console.log("Client disconnected:", socket.id);
    io.emit("updateUserCount", io.engine.clientsCount);
    for (const key of deniedManualRequests) {
      if (key.startsWith(`${socket.id}->`) || key.endsWith(`->${socket.id}`)) {
        deniedManualRequests.delete(key);
      }
    }
    try {
      await Interest.destroy({
        where: { socketId: socket.id },
      });
      broadcastActiveList();
    } catch (err) {
      console.error("Error cleaning up interests on disconnect:", err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  setTimeout(() => warmEmbeddingService("server started"), 1000);
});
