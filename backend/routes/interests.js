// routes/interests.js

const express = require("express");
const router = express.Router();
const Interest = require("../models/Interest");

// ================================================
// 1) GET /api/interests/active - List all unmatched interests
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
// 2) POST /api/interests/match - Manually match two users
// ================================================
router.post("/match", async (req, res) => {
  console.log("🕵️ manual-match called:", {
    requestToken: req.body.requestToken ? "[provided]" : "[missing]",
  });

  try {
    const { requestToken } = req.body;

    if (!requestToken) {
      return res.status(400).json({
        success: false,
        error: "Missing request token",
      });
    }

    const manualMatchRequests = req.app.get("manualMatchRequests");
    const request = manualMatchRequests.get(requestToken);

    if (!request || request.expiresAt <= Date.now()) {
      manualMatchRequests.delete(requestToken);
      return res.status(404).json({
        success: false,
        error: "Connection request expired or not found",
      });
    }

    manualMatchRequests.delete(requestToken);

    let callerInterest;
    let otherInterest;
    const roomId = req.app.get("makeRoomId")();
    await Interest.sequelize.transaction(async (t) => {
      callerInterest = await Interest.findOne({
        where: {
          id: request.requesterInterestId,
          socketId: request.requesterSocketId,
          matched: false,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      otherInterest = await Interest.findOne({
        where: {
          id: request.targetInterestId,
          socketId: request.targetSocketId,
          matched: false,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!callerInterest || !otherInterest) {
        throw new Error("Interest not found or already matched");
      }

      await Interest.update(
        { matched: true, roomId },
        {
          where: {
            id: [callerInterest.id, otherInterest.id],
            matched: false,
          },
          transaction: t,
        }
      );
    });

    const io = req.app.get("io");
    // Join both sockets into the room
    const callerSocket = io.sockets.sockets.get(request.requesterSocketId);
    if (callerSocket) callerSocket.join(roomId);
    const otherSocket = io.sockets.sockets.get(otherInterest.socketId);
    if (otherSocket) otherSocket.join(roomId);

    // Notify both peers
    io.to(request.requesterSocketId).emit("matchFound", {
      roomId,
      isInitiator: true,
      peerSocketId: otherInterest.socketId,
    });
    io.to(otherInterest.socketId).emit("matchFound", {
      roomId,
      isInitiator: false,
      peerSocketId: request.requesterSocketId,
    });

    // Re-broadcast updated active list
    await req.app.get("broadcastActiveList")();

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

module.exports = router;
