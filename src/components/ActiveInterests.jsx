/* src/components/ActiveInterests.jsx */
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../config";

const REQUEST_TIMEOUT_MS = 30000;

export default function ActiveInterests({ socket, myInterest, onlineCount = 0 }) {
  const [activeList, setActiveList] = useState([]);
  const [error, setError] = useState("");
  const [requestingId, setRequestingId] = useState(null);
  const [connectingId, setConnectingId] = useState(null);
  const [deniedSocketIds, setDeniedSocketIds] = useState(() => new Set());
  const myInterestId = myInterest?.id;
  const requestTimeoutRef = useRef(null);
  const requestingIdRef = useRef(null);

  const [mySocketId, setMySocketId] = useState("");

  function clearRequestTimeout() {
    if (requestTimeoutRef.current) {
      clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
  }

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
      clearRequestTimeout();
      requestingIdRef.current = null;
      setRequestingId(null);
      setConnectingId(null);
      setError(`User ${fromSocketId.slice(-6)} declined your request.`);
    }

    function handleManualRequestBlocked({ targetSocketId }) {
      setDeniedSocketIds((prev) => new Set(prev).add(targetSocketId));
      clearRequestTimeout();
      requestingIdRef.current = null;
      setRequestingId(null);
      setConnectingId(null);
      setError("This user declined your request for this session.");
    }

    function handleMatchFound() {
      clearRequestTimeout();
      setConnectingId(requestingIdRef.current);
      requestingIdRef.current = null;
      setRequestingId(null);
    }

    socket.on("requestDenied", handleRequestDenied);
    socket.on("manualRequestBlocked", handleManualRequestBlocked);
    socket.on("matchFound", handleMatchFound);
    return () => {
      clearRequestTimeout();
      socket.off("requestDenied", handleRequestDenied);
      socket.off("manualRequestBlocked", handleManualRequestBlocked);
      socket.off("matchFound", handleMatchFound);
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
    clearRequestTimeout();
    requestingIdRef.current = item.id;
    setRequestingId(item.id);
    setConnectingId(null);
    setError("");
    socket.emit("connectionRequest", {
      targetSocketId: item.socketId,
      requestId: myInterestId,
      requesterInterestId: myInterestId,
      targetInterestId: item.id,
      interest: myInterest.interest,
    });
    requestTimeoutRef.current = setTimeout(() => {
      setRequestingId((currentId) => (currentId === item.id ? null : currentId));
      if (requestingIdRef.current === item.id) {
        requestingIdRef.current = null;
      }
      setError("");
      requestTimeoutRef.current = null;
    }, REQUEST_TIMEOUT_MS);
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
          const isRequesting = requestingId === item.id;
          const isConnecting = connectingId === item.id;
          const isDisabled = isRequesting || isConnecting || isDenied;
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
                disabled={isDisabled}
                className={`ml-4 px-3 py-1 rounded text-white ${
                  isDisabled
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-500 hover:bg-green-600"
                }`}
              >
                {isDenied
                  ? "Declined"
                  : isConnecting
                    ? "Connecting..."
                    : isRequesting
                      ? "Requesting..."
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
