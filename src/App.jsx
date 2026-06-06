/* src/App.jsx */
import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";

import Navbar from "./components/Navbar";
import InterestForm from "./components/InterestForm";
import VideoCall from "./components/VideoCall";
import CameraPreview from "./components/CameraPreview";
import { API_BASE_URL } from "./config";
import { socket } from "./socket";

const STARTUP_NOTICE_SEEN_KEY = "startupNoticeSeen";
const STARTUP_NOTICE_MIN_VISIBLE_MS = 30000;
const CALL_ENDED_TOAST_MS = 5000;

function App() {
  // 1) Removed authentication state

  // 2) Call/match state and online‐user count
  const [callData, setCallData] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);

  // 3) Track our own submitted interest record
  const [myInterest, setMyInterest] = useState(null);

  // 4) Incoming connection request state
  const [incomingReq, setIncomingReq] = useState(null);
  const [showStartupNotice, setShowStartupNotice] = useState(false);
  const [startupNoticeCanClose, setStartupNoticeCanClose] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(socket.connected);
  const [callEndedToast, setCallEndedToast] = useState(null);

  useEffect(() => {
    const startupNoticeTimer = setTimeout(() => {
      const hasSeenStartupNotice = sessionStorage.getItem(
        STARTUP_NOTICE_SEEN_KEY
      );

      if (!socket.connected && !hasSeenStartupNotice) {
        sessionStorage.setItem(STARTUP_NOTICE_SEEN_KEY, "true");
        setShowStartupNotice(true);
      }
    }, 1200);

    // socket: connect, count, matchFound
    socket.on("connect", () => {
      localStorage.setItem("socketId", socket.id);
      setIsBackendConnected(true);
    });
    socket.on("disconnect", () => {
      setIsBackendConnected(false);
      setCallData(null);
    });
    socket.on("updateUserCount", setOnlineCount);
    socket.on("matchFound", (data) => {
      setCallData(data);
    });

    // 5) Handle incoming request
    socket.on("incomingRequest", (req) => {
      setIncomingReq(req);
    });
    return () => {
      clearTimeout(startupNoticeTimer);
      socket.off("connect");
      socket.off("disconnect");
      socket.off("updateUserCount");
      socket.off("matchFound");
      socket.off("incomingRequest");
    };
  }, []);

  useEffect(() => {
    if (!showStartupNotice) return undefined;

    setStartupNoticeCanClose(false);
    const minimumVisibleTimer = setTimeout(() => {
      setStartupNoticeCanClose(true);
    }, STARTUP_NOTICE_MIN_VISIBLE_MS);

    return () => clearTimeout(minimumVisibleTimer);
  }, [showStartupNotice]);

  useEffect(() => {
    if (showStartupNotice && startupNoticeCanClose && isBackendConnected) {
      setShowStartupNotice(false);
    }
  }, [isBackendConnected, showStartupNotice, startupNoticeCanClose]);

  useEffect(() => {
    if (!callEndedToast) return undefined;

    const toastTimer = setTimeout(() => {
      setCallEndedToast(null);
    }, CALL_ENDED_TOAST_MS);

    return () => clearTimeout(toastTimer);
  }, [callEndedToast]);

  // 7) When someone submits an interest, emit to server
  const handleInterestSubmit = (interest) => {
    if (!socket.connected) {
      return Promise.resolve({
        success: false,
        message: "Connection is still starting. Please try again.",
      });
    }

    return new Promise((resolve) => {
      socket.timeout(90000).emit("submitInterest", { interest }, (err, res) => {
        if (err) {
          resolve({
            success: false,
            message: "This is taking longer than expected. Please try again.",
          });
          return;
        }

        resolve(res);
      });
    });
  };

  return (
    <Router basename="/Video-Call-WebApp">
      {showStartupNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
            <h2 className="mb-3 text-xl font-semibold">Getting things ready</h2>
            <p className="text-sm leading-6 text-gray-700">
              The platform may take a little while to get everything up to
              speed after being idle. Please stay on this page while we connect
              you.
            </p>
            <button
              className="mt-5 rounded bg-pink-400 px-4 py-2 text-white"
              onClick={() => setShowStartupNotice(false)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Incoming connection request toast */}
      {incomingReq && (
        <div className="fixed right-4 top-4 z-50 w-[min(22rem,calc(100vw-2rem))] animate-[slideInToast_180ms_ease-out] rounded-lg border border-pink-200 bg-white p-4 text-left shadow-xl">
          <button
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            onClick={() => setIncomingReq(null)}
            aria-label="Dismiss request"
            title="Dismiss request"
          >
            ×
          </button>
          <div className="pr-8">
            <p className="text-sm font-semibold text-gray-900">
              Connection request
            </p>
            <p className="mt-2 text-sm text-gray-700">
              User {incomingReq.fromSocketId.slice(-6)} wants to connect
              (interest: <strong>{incomingReq.interest}</strong>).
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                className="rounded bg-green-500 px-4 py-2 text-sm text-white hover:bg-green-600"
                onClick={async () => {
                  // YES: call manual match
                  await fetch(
                    `${API_BASE_URL}/api/interests/${
                      incomingReq.requesterInterestId || incomingReq.requestId
                    }/match`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ socketId: socket.id }),
                    }
                  );
                  setIncomingReq(null);
                }}
              >
                Accept
              </button>
              <button
                className="rounded bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
                onClick={() => {
                  socket.emit("connectionResponse", {
                    targetSocketId: incomingReq.fromSocketId,
                    accepted: false,
                  });
                  setIncomingReq(null);
                }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {callEndedToast && (
        <div className="fixed right-4 top-4 z-50 w-[min(22rem,calc(100vw-2rem))] animate-[slideInToast_180ms_ease-out] rounded-lg border border-pink-200 bg-white p-4 pr-12 text-left shadow-xl">
          <button
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            onClick={() => setCallEndedToast(null)}
            aria-label="Dismiss call ended message"
            title="Dismiss"
          >
            ×
          </button>
          <p className="text-sm font-semibold text-gray-900">Call ended</p>
          <p className="mt-2 text-sm text-gray-700">{callEndedToast}</p>
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <div className="bg-pink-100 min-h-screen min-w-full">
              <Navbar
                onlineCount={onlineCount}
                socket={socket}
                myInterest={myInterest}
                callData={callData}
              />
              <div className="flex flex-col">
                {/* Left side: InterestForm + VideoCall or CameraPreview */}
                <div className="flex-1 p-4">
                  <InterestForm
                    socket={socket}
                    onSubmit={handleInterestSubmit}
                    onInterestAccepted={(newRecord) =>
                      setMyInterest(newRecord)
                    }
                  />
                  <div className="mt-6">
                    {callData ? (
                      <VideoCall
                        callData={callData}
                        socket={socket}
                        onCallEnded={() => {
                          setCallData(null);
                          setCallEndedToast("The other user left the call.");
                        }}
                      />
                    ) : (
                      <CameraPreview />
                    )}
                  </div>
                </div>
              </div>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
