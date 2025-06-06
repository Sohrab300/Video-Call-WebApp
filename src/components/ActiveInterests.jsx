// src/components/ActiveInterests.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Replace this with whatever you use to store the user’s socketId
// (e.g. if you saved it in localStorage when you connected via Socket.IO)
const getMySocketId = () => localStorage.getItem("socketId");

const BACKEND_BASE =
  "https://my-backend-service-257606194123.us-central1.run.app";

function timeSince(dateString) {
  const now = new Date();
  const created = new Date(dateString);
  const diffMs = now - created;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function ActiveInterests() {
  const [activeList, setActiveList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matchingId, setMatchingId] = useState(null); // ID we’re currently connecting to
  const navigate = useNavigate();
  const mySocketId = getMySocketId();

  useEffect(() => {
    // Fetch once on mount
    fetchActiveInterests();

    // Optionally: poll every 10 seconds
    const interval = setInterval(fetchActiveInterests, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchActiveInterests = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/interests/active`);
      const json = await res.json();
      if (json.success) {
        // Filter out ourselves (so we don’t see our own entry in the list)
        const listWithoutMe = json.data.filter(
          (item) => item.socketId !== mySocketId
        );
        setActiveList(listWithoutMe);
      } else {
        setError("Failed to fetch active interests.");
      }
    } catch (err) {
      console.error("Error fetching active interests:", err);
      setError("Unable to load active interests.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (targetId) => {
    if (!mySocketId) {
      setError("Your socket ID is missing. Please reconnect.");
      return;
    }
    setMatchingId(targetId);
    setError("");

    try {
      const res = await fetch(
        `${BACKEND_BASE}/api/interests/${targetId}/match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ socketId: mySocketId }),
        }
      );
      const json = await res.json();

      if (res.ok && json.success) {
        const { roomId } = json.data;
        // Navigate to your video/chat page, e.g. /room/<roomId>
        navigate(`/room/${roomId}`);
      } else {
        setError(json.error || "Match attempt failed.");
        setMatchingId(null);
      }
    } catch (err) {
      console.error("Error in handleConnect:", err);
      setError("Unable to connect at this time.");
      setMatchingId(null);
    }
  };

  if (loading)
    return <p className="text-center mt-4">Loading active interests…</p>;
  if (error) return <p className="text-red-500 text-center mt-2">{error}</p>;

  return (
    <div className="max-w-md mx-auto mt-6">
      <h2 className="text-xl font-semibold mb-4">Who’s waiting to connect?</h2>
      {activeList.length === 0 ? (
        <p className="text-gray-600">
          No active interests right now. Try again soon!
        </p>
      ) : (
        activeList.map((item) => (
          <div
            key={item.id}
            className="border rounded p-3 mb-3 flex justify-between items-center"
          >
            <div>
              <p className="font-medium">
                {/* Show last 6 chars of socketId or item.id: */}
                User {item.socketId.slice(-6)}
              </p>
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
