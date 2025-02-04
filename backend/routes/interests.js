// routes/interests.js
const express = require('express');
const router = express.Router();
const Interest = require('../models/Interest');

// POST /api/interests - Save a new interest
router.post('/', async (req, res) => {
  try {
    const { socketId, interest } = req.body;
    const newInterest = await Interest.create({
      socketId,
      interest,
      matched: false,
    });
    res.status(201).json(newInterest);
  } catch (error) {
    console.error('Error saving interest:', error);
    res.status(500).json({ error: 'Server error saving interest' });
  }
});

// GET /api/interests - Get an unmatched interest for a given interest string
router.get('/', async (req, res) => {
  try {
    const { interest, socketId } = req.query;
    const found = await Interest.findOne({
      where: {
        interest,
        matched: false,
        socketId: { [Op.ne]: socketId },
      },
    });
    res.status(200).json(found);
  } catch (error) {
    console.error('Error retrieving interest:', error);
    res.status(500).json({ error: 'Server error retrieving interest' });
  }
});

// PUT /api/interests/:id - Update an interest record (mark as matched, etc.)
router.put('/:id', async (req, res) => {
  try {
    const { matched, roomId } = req.body;
    await Interest.update({ matched, roomId }, { where: { id: req.params.id } });
    const updatedInterest = await Interest.findByPk(req.params.id);
    res.status(200).json(updatedInterest);
  } catch (error) {
    console.error('Error updating interest:', error);
    res.status(500).json({ error: 'Server error updating interest' });
  }
});

module.exports = router;
