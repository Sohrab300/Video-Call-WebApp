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

// Import rate limit middleware
const rateLimit = require('express-rate-limit');

const app = express();

// Set up rate limiting (e.g., 100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 100 requests per window
  message: "Too many requests from this IP, please try again after 15 minutes.",
});

// Apply the rate limiter to all requests
app.use(limiter);

app.use(cors());
app.use(express.json());
app.use('/api/interests', interestsRouter);

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

sequelize.authenticate()
  .then(() => console.log('PostgreSQL connected'))
  .catch(err => console.error('PostgreSQL connection error:', err));

// For development, we're forcing table recreation. In production, use migrations.
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
  // Compute dot product of normalized vectors
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

    // Save the new interest record along with its embedding
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

    // Fetch all unmatched interests from other sockets
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

    // Compare the new embedding with each unmatched embedding using cosine similarity
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

    // Define a threshold for similarity (e.g., 0.1 in your code)
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

  // Listen for chat messages
  socket.on("chatMessage", (data) => {
    console.log("Chat message received:", data);
    // Broadcast the message to other clients in the same room
    socket.to(data.roomId).emit("chatMessage", data);
  });

  // Emit the updated user count to everyone
  io.emit("updateUserCount", io.engine.clientsCount);

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    // Emit the updated user count when a client disconnects
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
