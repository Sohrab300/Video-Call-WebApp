/* src/components/ActiveInterests.jsx */
import { useEffect, useState } from "react";
import { API_BASE_URL } from "../config";

export default function ActiveInterests({ socket, myInterest, onlineCount = 0 }) {
  const [activeList, setActiveList] = useState([]);
  const [error, setError] = useState("");
  const [matchingId, setMatchingId] = useState(null);
  const [deniedSocketIds, setDeniedSocketIds] = useState(() => new Set());
  const myInterestId = myInterest?.id;

  const [mySocketId, setMySocketId] = useState("");

  useEffect(() => {
    function handleConnect() {
      setMySocketId(socket.id);
    }
    if (socket.connected) handleConnect();
    socket.on("connect", handleConnect);
    return () => {
      socket.off("connect", handleConnect);
    };
  }, [socket]);

  useEffect(() => {
    if (!mySocketId) return;

    let isMounted = true;
    async function fetchActiveInterests() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/interests/active`);
        const payload = await response.json();
        if (isMounted && payload.success) {
          handleActiveUpdate(payload.data);
        }
      } catch (error) {
        console.error("Error fetching active interests:", error);
      }
    }

    function handleActiveUpdate(newList) {
      // Exclude both self and the peer we've requested (pending)
      const filtered = newList.filter(
        (item) =>
          item.socketId !== mySocketId && item.id !== Number(myInterestId)
      );
      setActiveList(filtered);
    }

    fetchActiveInterests();
    socket.on("activeListUpdated", handleActiveUpdate);
    return () => {
      isMounted = false;
      socket.off("activeListUpdated", handleActiveUpdate);
    };
  }, [socket, mySocketId, myInterestId]);

  useEffect(() => {
    function handleRequestDenied({ fromSocketId }) {
      setDeniedSocketIds((prev) => new Set(prev).add(fromSocketId));
      setMatchingId(null);
      setError(`User ${fromSocketId.slice(-6)} declined your request.`);
    }

    function handleManualRequestBlocked({ targetSocketId }) {
      setDeniedSocketIds((prev) => new Set(prev).add(targetSocketId));
      setMatchingId(null);
      setError("This user declined your request for this session.");
    }

    socket.on("requestDenied", handleRequestDenied);
    socket.on("manualRequestBlocked", handleManualRequestBlocked);
    return () => {
      socket.off("requestDenied", handleRequestDenied);
      socket.off("manualRequestBlocked", handleManualRequestBlocked);
    };
  }, [socket]);

  const handleConnect = (item) => {
    if (!myInterestId) {
      setError("Submit your interest before connecting.");
      return;
    }
    if (deniedSocketIds.has(item.socketId)) {
      setError("This user declined your request for this session.");
      return;
    }
    setMatchingId(item.id);
    setError("");
    socket.emit("connectionRequest", {
      targetSocketId: item.socketId,
      requestId: myInterestId,
      requesterInterestId: myInterestId,
      targetInterestId: item.id,
      interest: myInterest.interest,
    });
  };

  const emptyMessage =
    onlineCount <= 1
      ? "No users online."
      : "Please wait for others to submit their interest.";

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold">Who&apos;s waiting to connect?</h2>
      {error && <p className="text-red-500 text-center mb-2">{error}</p>}

      {activeList.length === 0 ? (
        <p className="text-gray-600">{emptyMessage}</p>
      ) : (
        activeList.map((item) => {
          const isDenied = deniedSocketIds.has(item.socketId);
          return (
            <div
              key={item.id}
              className="mb-3 flex items-center justify-between rounded border p-3"
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
                disabled={matchingId === item.id || isDenied}
                className={`ml-4 px-3 py-1 rounded text-white ${
                  matchingId === item.id || isDenied
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-500 hover:bg-green-600"
                }`}
              >
                {isDenied
                  ? "Declined"
                  : matchingId === item.id
                    ? "Connecting…"
                    : "Connect"}
              </button>
            </div>
          );
        })
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
