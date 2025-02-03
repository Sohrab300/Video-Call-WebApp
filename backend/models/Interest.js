// backend/models/Interest.js
const mongoose = require('mongoose');

const interestSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  interest: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  matched: { type: Boolean, default: false },
  roomId: { type: String } // optional: to store the room ID when matched
});

module.exports = mongoose.model('Interest', interestSchema);
