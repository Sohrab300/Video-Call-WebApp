// backend/index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// Import the Interest model (ensure the file name and export match)
const Interest = require('./models/Interest');

// Import the interests API router
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

// Connect to MongoDB
const mongoURI = 'mongodb://localhost:27017/videoCallApp'; // Change as needed
mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Handle interest submissions and store in MongoDB
  socket.on('submitInterest', async ({ interest }) => {
    console.log(`User ${socket.id} submitted interest: ${interest}`);

    // Save the new interest document in MongoDB
    let newInterest;
    try {
      newInterest = new Interest({
        socketId: socket.id,
        interest: interest,
        matched: false,
      });
      await newInterest.save();
      console.log('Interest saved to MongoDB:', newInterest);
    } catch (error) {
      console.error('Error saving interest:', error);
      return;
    }

    // Query MongoDB for an existing unmatched interest with the same value (and a different socketId)
    try {
      const otherInterest = await Interest.findOne({
        interest: interest,
        matched: false,
        socketId: { $ne: socket.id },
      });

      if (otherInterest) {
        // We found a match!
        const roomId = `${interest}-${Date.now()}`;

        // Update both interest records as matched with the roomId
        await Interest.findByIdAndUpdate(newInterest._id, { matched: true, roomId });
        await Interest.findByIdAndUpdate(otherInterest._id, { matched: true, roomId });
        console.log(`Match found for interest "${interest}" in room ${roomId}`);

        // Have both sockets join the same room
        socket.join(roomId);
        io.to(otherInterest.socketId).socketsJoin(roomId);

        // Emit the matchFound event to both clients
        io.to(socket.id).emit('matchFound', { roomId, isInitiator: true });
        io.to(otherInterest.socketId).emit('matchFound', { roomId, isInitiator: false });
      }
      // If no match is found, the new record remains unmatched in the DB until another submission arrives.
    } catch (err) {
      console.error('Error matching interests:', err);
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

  // Cleanup on disconnect: remove any unmatched interest records for this socket
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    try {
      await Interest.deleteMany({ socketId: socket.id, matched: false });
    } catch (err) {
      console.error('Error cleaning up interests on disconnect:', err);
    }
  });
});

// Start the server on the specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
