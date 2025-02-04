// backend/index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const sequelize = require('./database'); // PostgreSQL connection via Sequelize
const { Op } = require('sequelize'); // Sequelize operators
const stringSimilarity = require('string-similarity'); // For cosine similarity

// Import the Interest model (now a Sequelize model)
const Interest = require('./models/Interest');

// Import the interests API router (update it separately to use Sequelize if needed)
const interestsRouter = require('./routes/interests');

const app = express();
app.use(cors());

// Middleware to parse JSON request bodies
app.use(express.json());

// Mount the interests API router under /api/interests
app.use('/api/interests', interestsRouter);

// Create the HTTP server and initialize Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' },
});

// Connect to PostgreSQL and sync models
sequelize.authenticate()
  .then(() => console.log('PostgreSQL connected'))
  .catch(err => console.error('PostgreSQL connection error:', err));

sequelize.sync() // This will create tables if they don't exist
  .then(() => console.log('Sequelize models synchronized'))
  .catch(err => console.error('Error synchronizing Sequelize models:', err));

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Handle interest submissions and store in PostgreSQL using cosine similarity matching
  socket.on('submitInterest', async ({ interest }) => {
    console.log(`User ${socket.id} submitted interest: ${interest}`);

    // Save the new interest record in PostgreSQL using Sequelize
    let newInterest;
    try {
      newInterest = await Interest.create({
        socketId: socket.id,
        interest: interest,
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
      // No other unmatched interest exists.
      return;
    }

    // Compute cosine similarity (using string-similarity) for each unmatched interest
    let bestMatch = null;
    let bestScore = 0;
    unmatchedInterests.forEach(interestRecord => {
      // Convert both strings to lower case for case-insensitive comparison
      const score = stringSimilarity.compareTwoStrings(
        interest.toLowerCase(), 
        interestRecord.interest.toLowerCase()
      );
      if (score > bestScore) {
        bestScore = score;
        bestMatch = interestRecord;
      }
    });

    // Set a threshold for similarity (e.g., 0.7 means 70% similarity)
    const threshold = 0.7;
    if (bestScore >= threshold && bestMatch) {
      const roomId = `${interest}-${Date.now()}`;
      
      // Update both interest records as matched with the roomId
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
        console.error('Error updating matched interests:', err);
        return;
      }
      
      console.log(`Match found between "${interest}" and "${bestMatch.interest}" (score: ${bestScore}) in room ${roomId}`);

      // Have both sockets join the same room
      socket.join(roomId);
      io.to(bestMatch.socketId).socketsJoin(roomId);

      // Emit the matchFound event to both clients
      io.to(socket.id).emit('matchFound', { roomId, isInitiator: true });
      io.to(bestMatch.socketId).emit('matchFound', { roomId, isInitiator: false });
    }
    // If no match meets the threshold, the new record remains unmatched in the DB until another submission arrives.
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

  // Cleanup on disconnect: remove any unmatched interest records for this socket
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    try {
      await Interest.destroy({ where: { socketId: socket.id, matched: false } });
    } catch (err) {
      console.error('Error cleaning up interests on disconnect:', err);
    }
  });
});

// Start the server on the specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
