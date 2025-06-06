require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const sequelize = require('./database');
const { Op } = require('sequelize');
const getEmbedding = require('./utils/getEmbedding'); // New utility for embeddings

const Interest = require('./models/Interest');
const interestsRouter = require('./routes/interests');

// Import the auth router (make sure you've created routes/auth.js)
const authRouter = require('./routes/auth');

// Import rate limit middleware
const rateLimit = require('express-rate-limit');

const app = express();

// Set up rate limiting (e.g., 50 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: "Too many requests from this IP, please try again after 15 minutes.",
});

// Apply the rate limiter to all requests
app.use(limiter);

app.options('*', cors());

const allowedOrigins = [
  "http://localhost:5173",
  "https://sohrab300.github.io"
];

app.use(cors({
  origin: (incomingOrigin, callback) => {
    // Allow requests with no origin (like curl, Postman)
    if (!incomingOrigin) return callback(null, true);
    if (allowedOrigins.includes(incomingOrigin)) {
      return callback(null, true);
    }
    // Other origins are rejected
    return callback(new Error("Not allowed by CORS"), false);
  }
}));

app.use(express.json());

// Mount the authentication routes before other routes
app.use('/api/auth', authRouter);

// Mount other routes (e.g., interests)
app.use('/api/interests', interestsRouter);

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

sequelize.authenticate()
  .then(() => console.log('PostgreSQL connected'))
  .catch(err => console.error('PostgreSQL connection error:', err));

// For development, we're forcing table recreation.
// Make sure the User model is imported somewhere (e.g., in auth routes or here) so it's included.
sequelize.sync({ force: true })
  .then(() => console.log('Sequelize models synchronized'))
  .catch(err => console.error('Error synchronizing Sequelize models:', err));

// Helper function to normalize a vector
const normalize = (vec) => {
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return vec.map(val => val / magnitude);
};

// Updated cosine similarity function using normalized vectors
const cosineSimilarity = (vecA, vecB) => {
  const normA = normalize(vecA);
  const normB = normalize(vecB);
  return normA.reduce((sum, a, i) => sum + a * normB[i], 0);
};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('submitInterest', async ({ interest }) => {
    console.log(`User ${socket.id} submitted interest: ${interest}`);

    // Get vector embedding for the submitted interest
    const embedding = await getEmbedding(interest);
    if (!embedding) {
      console.error('Failed to get embedding for interest.');
      return;
    }

    let newInterest;
    try {
      newInterest = await Interest.create({
        socketId: socket.id,
        interest,
        embedding,
        matched: false,
      });
      console.log('Interest saved to PostgreSQL:', newInterest.toJSON());
    } catch (error) {
      console.error('Error saving interest:', error);
      return;
    }

    let unmatchedInterests;
    try {
      unmatchedInterests = await Interest.findAll({
        where: {
          matched: false,
          socketId: { [Op.ne]: socket.id },
        },
      });
    } catch (err) {
      console.error('Error fetching unmatched interests:', err);
      return;
    }

    if (!unmatchedInterests || unmatchedInterests.length === 0) {
      return;
    }

    let bestMatch = null;
    let bestScore = 0;
    for (const interestRecord of unmatchedInterests) {
      if (!interestRecord.embedding) continue;
      const score = cosineSimilarity(embedding, interestRecord.embedding);
      console.log(`Similarity score between "${interest}" and "${interestRecord.interest}": ${score}`);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = interestRecord;
      }
    }

    const threshold = 0.1;
    if (bestScore >= threshold && bestMatch) {
      const roomId = `${interest}-${Date.now()}`;
      try {
        await Interest.update({ matched: true, roomId }, { where: { id: newInterest.id } });
        await Interest.update({ matched: true, roomId }, { where: { id: bestMatch.id } });
      } catch (err) {
        console.error('Error updating matched interests:', err);
        return;
      }
      console.log(`Match found between "${interest}" and "${bestMatch.interest}" (score: ${bestScore}) in room ${roomId}`);
      socket.join(roomId);
      io.to(bestMatch.socketId).socketsJoin(roomId);
      io.to(socket.id).emit('matchFound', { roomId, isInitiator: true });
      io.to(bestMatch.socketId).emit('matchFound', { roomId, isInitiator: false });
    }
  });

  // Relay signaling messages
  socket.on('offer', ({ offer, roomId }) => {
    socket.to(roomId).emit('offer', { offer });
  });

  socket.on('answer', ({ answer, roomId }) => {
    socket.to(roomId).emit('answer', { answer });
  });

  socket.on('iceCandidate', ({ candidate, roomId }) => {
    socket.to(roomId).emit('iceCandidate', { candidate });
  });

  socket.on("chatMessage", (data) => {
    console.log("Chat message received:", data);
    socket.to(data.roomId).emit("chatMessage", data);
  });

  io.emit("updateUserCount", io.engine.clientsCount);

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    io.emit("updateUserCount", io.engine.clientsCount);
    try {
      await Interest.destroy({ where: { socketId: socket.id, matched: false } });
    } catch (err) {
      console.error("Error cleaning up interests on disconnect:", err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
