// backend/routes/interests.js
const express = require('express');
const router = express.Router();
const Interest = require('../models/Interest'); // Adjust the path if needed

// POST /api/interests - Save a new interest
router.post('/', async (req, res) => {
  try {
    const { socketId, interest } = req.body;
    const newInterest = new Interest({
      socketId,
      interest,
      matched: false,
    });
    await newInterest.save();
    res.status(201).json(newInterest);
  } catch (error) {
    console.error('Error saving interest:', error);
    res.status(500).json({ error: 'Server error saving interest' });
  }
});

// GET /api/interests - Get an unmatched interest for a given interest string
// Example: GET /api/interests?interest=football&socketId=12345
router.get('/', async (req, res) => {
  try {
    const { interest, socketId } = req.query;
    // Find an unmatched interest for this interest and a different socket
    const found = await Interest.findOne({
      interest,
      matched: false,
      socketId: { $ne: socketId },
    });
    res.status(200).json(found);
  } catch (error) {
    console.error('Error retrieving interest:', error);
    res.status(500).json({ error: 'Server error retrieving interest' });
  }
});

// PUT /api/interests/:id - Update an interest record (e.g., mark as matched and set roomId)
router.put('/:id', async (req, res) => {
  try {
    const { matched, roomId } = req.body;
    const updatedInterest = await Interest.findByIdAndUpdate(
      req.params.id,
      { matched, roomId },
      { new: true }
    );
    res.status(200).json(updatedInterest);
  } catch (error) {
    console.error('Error updating interest:', error);
    res.status(500).json({ error: 'Server error updating interest' });
  }
});

module.exports = router;
