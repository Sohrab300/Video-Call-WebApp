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
const authRouter = require("./routes/auth");
const rateLimit = require("express-rate-limit");

const app = express();

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
app.use("/api/auth", authRouter);
app.use("/api/interests", interestsRouter);

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// Make Socket.IO available in `req.app.get('io')`
app.set("io", io);

sequelize
  .authenticate()
  .then(() => console.log("PostgreSQL connected"))
  .catch((err) => console.error("PostgreSQL connection error:", err));

// For development: force sync (drops & recreates tables)
sequelize
  .sync({ force: true })
  .then(() => console.log("Sequelize models synchronized"))
  .catch((err) => console.error("Error synchronizing Sequelize models:", err));

// Utility: normalize & cosine similarity
const normalize = (vec) => {
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
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

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Send current active list immediately
  (async () => {
    const activeList = await Interest.findAll({
      where: { matched: false },
      attributes: ["id", "socketId", "interest", "createdAt"],
      order: [["createdAt", "ASC"]],
    });
    socket.emit("activeListUpdated", activeList);
  })();

  // ─── Handle "submitInterest" ─────────────────────────────────────
  socket.on("submitInterest", async ({ interest }) => {
    console.log(`User ${socket.id} submitted interest: ${interest}`);

    // 1) Generate embedding
    let embedding;
    try {
      embedding = await getEmbedding(interest);
    } catch (err) {
      console.error("Embedding service error:", err);
      socket.emit("interestError", {
        message: "Embedding service error. Please try again.",
      });
      return;
    }
    if (!embedding || !Array.isArray(embedding)) {
      console.error("Failed to generate embedding");
      socket.emit("interestError", {
        message: "Failed to generate embedding. Please submit again.",
      });
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
      console.log("Interest saved:", newInterest.toJSON());
    } catch (error) {
      console.error("Database error saving interest:", error);
      socket.emit("interestError", {
        message: "Database error. Please try again.",
      });
      return;
    }

    // 3) Acknowledge client of success
    socket.emit("interestAccepted", { interest: newInterest });

    // 4) Broadcast updated active list to all clients
    broadcastActiveList();

    // 5) Relay connection requests from A → B
    socket.on(
      "connectionRequest",
      ({ targetSocketId, requestId, interest }) => {
        // forward to B
        socket.to(targetSocketId).emit("incomingRequest", {
          fromSocketId: socket.id,
          requestId,
          interest,
        });
      }
    );

    // 6) Relay denials from B → A
    socket.on("connectionResponse", ({ targetSocketId, accepted }) => {
      if (!accepted) {
        // tell A that B said no
        socket.to(targetSocketId).emit("requestDenied", {
          fromSocketId: socket.id,
        });
      }
      // if accepted, we do nothing here because B will call the REST match endpoint
    });

    // 7) Attempt to auto-match
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
      socket.emit("matchFound", { roomId, isInitiator: true });
      io.to(bestMatch.socketId).emit("matchFound", {
        roomId,
        isInitiator: false,
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
  socket.on("chatMessage", (data) =>
    socket.to(data.roomId).emit("chatMessage", data)
  );

  // ─── User count update ─────────────────────────────────────────────
  io.emit("updateUserCount", io.engine.clientsCount);

  // ─── Handle disconnect ─────────────────────────────────────────────
  socket.on("disconnect", async () => {
    console.log("Client disconnected:", socket.id);
    io.emit("updateUserCount", io.engine.clientsCount);
    try {
      await Interest.destroy({
        where: { socketId: socket.id, matched: false },
      });
      broadcastActiveList();
    } catch (err) {
      console.error("Error cleaning up interests on disconnect:", err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
