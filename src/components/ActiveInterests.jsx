// src/components/ActiveInterests.jsx
import React, { useEffect, useState } from "react";

export default function ActiveInterests({ socket, onMatch }) {
  const [activeList, setActiveList] = useState([]);
  const [error, setError] = useState("");
  const [matchingId, setMatchingId] = useState(null);

  // 1) Store the live socket.id in state (no more localStorage race‐condition)
  const [mySocketId, setMySocketId] = useState("");

  useEffect(() => {
    // As soon as socket connects, grab the real socket.id
    function handleConnect() {
      setMySocketId(socket.id);
    }
    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, [socket]);

  // 2) Only after we know our own socketId, start listening for the active‐list
  useEffect(() => {
    if (!mySocketId) return; // don’t subscribe until we have a real socket.id

    function handleActiveUpdate(newList) {
      // Filter out our own entry using the up‐to‐date mySocketId
      const filtered = newList.filter((item) => item.socketId !== mySocketId);
      setActiveList(filtered);
    }

    socket.on("activeListUpdated", handleActiveUpdate);

    return () => {
      socket.off("activeListUpdated", handleActiveUpdate);
    };
  }, [socket, mySocketId]);

  const handleConnect = async (targetId) => {
    if (!mySocketId) {
      setError("Your socket ID is missing. Please refresh.");
      return;
    }
    setMatchingId(targetId);
    setError("");

    try {
      const res = await fetch(
        // Make sure this URL matches your actual backend (not “localhost:3000” once deployed)
        `https://my-backend-service-257606194123.us-central1.run.app/api/interests/${targetId}/match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ socketId: mySocketId }),
        }
      );
      const json = await res.json();

      if (res.status === 429) {
        setError("Too many requests. Please wait a moment.");
        setMatchingId(null);
        return;
      }
      if (!res.ok || !json.success) {
        setError(json.error || "Match attempt failed.");
        setMatchingId(null);
        return;
      }

      // Tell App we matched, so it can render VideoCall
      onMatch({ roomId: json.data.roomId });
    } catch (err) {
      console.error("Error in handleConnect:", err);
      setError("Unable to connect right now.");
      setMatchingId(null);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-6">
      <h2 className="text-xl font-semibold mb-4">Who’s waiting to connect?</h2>
      {error && <p className="text-red-500 text-center mb-2">{error}</p>}

      {activeList.length === 0 ? (
        <p className="text-gray-600">
          No active interests right now. Please wait…
        </p>
      ) : (
        activeList.map((item) => (
          <div
            key={item.id}
            className="border rounded p-3 mb-3 flex justify-between items-center"
          >
            <div>
              <p className="font-medium">User {item.socketId.slice(-6)}</p>
              <p className="italic text-sm">“{item.interest}”</p>
              <p className="text-xs text-gray-500">
                waiting {timeSince(item.createdAt)}
              </p>
            </div>
            <button
              onClick={() => handleConnect(item.id)}
              disabled={matchingId === item.id}
              className={`ml-4 px-3 py-1 rounded text-white ${
                matchingId === item.id
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {matchingId === item.id ? "Connecting…" : "Connect"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// You can keep your existing timeSince(...) helper here
function timeSince(dateString) {
  /* … */
}
