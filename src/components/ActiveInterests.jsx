/* src/components/ActiveInterests.jsx */
import React, { useEffect, useState } from "react";

export default function ActiveInterests({ socket, onMatch, myInterestId }) {
  const [activeList, setActiveList] = useState([]);
  const [error, setError] = useState("");
  const [matchingId, setMatchingId] = useState(null);

  const [mySocketId, setMySocketId] = useState("");

  useEffect(() => {
    function handleConnect() {
      setMySocketId(socket.id);
    }
    socket.on("connect", handleConnect);
    return () => {
      socket.off("connect", handleConnect);
    };
  }, [socket]);

  useEffect(() => {
    if (!mySocketId) return;
    function handleActiveUpdate(newList) {
      const filtered = newList.filter(
        (item) =>
          item.socketId !== mySocketId && item.id !== Number(myInterestId)
      );
      setActiveList(filtered);
    }
    socket.on("activeListUpdated", handleActiveUpdate);
    return () => {
      socket.off("activeListUpdated", handleActiveUpdate);
    };
  }, [socket, mySocketId, myInterestId]);

  const handleConnect = (item) => {
    setMatchingId(item.id);
    setError("");
    fetch(
      `https://my-backend-service-257606194123.us-central1.run.app/api/interests/${item.id}/match`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socketId: mySocketId }),
      }
    )
      .then((res) =>
        res.json().then((json) => ({ status: res.status, body: json }))
      )
      .then(({ status, body }) => {
        if (status === 429) {
          setError("Too many requests. Please wait a moment.");
          setMatchingId(null);
          return;
        }
        if (!body.success) {
          setError(body.error || "Match attempt failed.");
          setMatchingId(null);
          return;
        }
        onMatch({ roomId: body.data.roomId });
      })
      .catch((err) => {
        console.error("Error in handleConnect:", err);
        setError("Unable to connect right now.");
        setMatchingId(null);
      });
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
              onClick={() => handleConnect(item)}
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
