// routes/interests.js

const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const Interest = require("../models/Interest");
const getEmbedding = require("../utils/getEmbedding"); // ← Import your real embedding utility

// ================================================
// 1) Helper to Create a Unique Room ID
// ================================================
function makeRoomId() {
  return `room-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// ================================================
// 2) POST /api/interests/ - Save a new interest with embedding
// ================================================
router.post("/", async (req, res) => {
  try {
    const { socketId, interest } = req.body;

    if (!socketId || !interest) {
      return res.status(400).json({
        success: false,
        message: "Missing socketId or interest",
      });
    }

    const embedding = await getEmbedding(interest);
    if (!embedding || !Array.isArray(embedding)) {
      return res.status(500).json({
        success: false,
        message: "Embedding generation failed. Please submit again.",
      });
    }

    const newInterest = await Interest.create({
      socketId,
      interest,
      embedding,
      matched: false,
    });

    return res.status(201).json({
      success: true,
      message:
        "Your interest has been received. Please wait while we try to match you.",
      data: newInterest,
    });
  } catch (error) {
    console.error("Error saving interest:", error);
    return res.status(500).json({
      success: false,
      message: "Server error saving interest",
    });
  }
});

// ================================================
// 3) GET /api/interests/active - List all unmatched interests
// ================================================
router.get("/active", async (req, res) => {
  try {
    const activeList = await Interest.findAll({
      where: { matched: false },
      attributes: ["id", "socketId", "interest", "createdAt"],
      order: [["createdAt", "ASC"]],
    });
    return res.status(200).json({ success: true, data: activeList });
  } catch (error) {
    console.error("Error fetching active interests:", error);
    return res.status(500).json({
      success: false,
      error: "Server error fetching active interests",
    });
  }
});

// ================================================
// 4) POST /api/interests/:id/match - Manually match two users
// ================================================
router.post("/:id/match", async (req, res) => {
  console.log("🕵️ manual-match called:", {
    otherId: req.params.id,
    callerSocketId: req.body.socketId,
  });

  try {
    const otherId = req.params.id;
    const { socketId: callerSocketId } = req.body;

    if (!callerSocketId) {
      return res.status(400).json({
        success: false,
        error: "Missing callerSocketId in request body",
      });
    }

    const callerInterest = await Interest.findOne({
      where: { socketId: callerSocketId, matched: false },
    });
    if (!callerInterest) {
      return res.status(404).json({
        success: false,
        error: "Your own interest not found or already matched",
      });
    }

    const otherInterest = await Interest.findOne({
      where: { id: otherId, matched: false },
    });
    if (!otherInterest) {
      return res.status(404).json({
        success: false,
        error: "Selected interest not found or already matched",
      });
    }

    const roomId = makeRoomId();
    await Interest.sequelize.transaction(async (t) => {
      await callerInterest.update(
        { matched: true, roomId },
        { transaction: t }
      );
      await otherInterest.update({ matched: true, roomId }, { transaction: t });
    });

    const io = req.app.get("io");
    // Join both sockets into the room
    const callerSocket = io.sockets.sockets.get(callerSocketId);
    if (callerSocket) callerSocket.join(roomId);
    const otherSocket = io.sockets.sockets.get(otherInterest.socketId);
    if (otherSocket) otherSocket.join(roomId);

    // Notify both peers
    io.to(callerSocketId).emit("matchFound", { roomId, isInitiator: true });
    io.to(otherInterest.socketId).emit("matchFound", {
      roomId,
      isInitiator: false,
    });

    // Re-broadcast updated active list
    const activeList = await Interest.findAll({
      where: { matched: false },
      attributes: ["id", "socketId", "interest", "createdAt"],
      order: [["createdAt", "ASC"]],
    });
    io.emit("activeListUpdated", activeList);

    return res.status(200).json({
      success: true,
      message: "Matched successfully",
      data: {
        roomId,
        peerInterest: {
          id: otherInterest.id,
          socketId: otherInterest.socketId,
          interest: otherInterest.interest,
        },
      },
    });
  } catch (error) {
    console.error("Error in manual match:", error);
    return res.status(500).json({
      success: false,
      error: "Server error during match",
    });
  }
});

// ================================================
// 5) GET /api/interests - (Existing) Auto-match by interest string
// ================================================
router.get("/", async (req, res) => {
  try {
    const { interest, socketId } = req.query;
    const found = await Interest.findOne({
      where: { interest, matched: false, socketId: { [Op.ne]: socketId } },
    });
    return res.status(200).json(found);
  } catch (error) {
    console.error("Error retrieving interest:", error);
    return res.status(500).json({ error: "Server error retrieving interest" });
  }
});

// ================================================
// 6) PUT /api/interests/:id - (Existing) Update matched & roomId
// ================================================
router.put("/:id", async (req, res) => {
  try {
    const { matched, roomId } = req.body;
    await Interest.update(
      { matched, roomId },
      { where: { id: req.params.id } }
    );
    const updatedInterest = await Interest.findByPk(req.params.id);
    return res.status(200).json(updatedInterest);
  } catch (error) {
    console.error("Error updating interest:", error);
    return res.status(500).json({ error: "Server error updating interest" });
  }
});

module.exports = router;
