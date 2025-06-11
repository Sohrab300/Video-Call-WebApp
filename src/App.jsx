/* src/App.jsx */
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import io from "socket.io-client";

import Navbar from "./components/Navbar";
import InterestForm from "./components/InterestForm";
import ActiveInterests from "./components/ActiveInterests";
import VideoCall from "./components/VideoCall";
import CameraPreview from "./components/CameraPreview";
import Login from "./components/Login";
import Signup from "./components/SignUp";

// Initialize a single Socket.IO instance
export const socket = io(
  "https://my-backend-service-257606194123.us-central1.run.app"
);

function App() {
  // 1) Authentication state
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    return token ? { token, username } : null;
  });

  // 2) Call/match state and online‐user count
  const [callData, setCallData] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);

  // 3) Track our own submitted interest record ID
  const [myInterestId, setMyInterestId] = useState(null);

  // 4) Incoming connection request state
  const [incomingReq, setIncomingReq] = useState(null);

  useEffect(() => {
    // socket: connect, count, matchFound
    socket.on("connect", () => {
      localStorage.setItem("socketId", socket.id);
    });
    socket.on("updateUserCount", setOnlineCount);
    socket.on("matchFound", (data) => {
      setCallData(data);
    });

    // 5) Handle incoming request
    socket.on("incomingRequest", (req) => {
      setIncomingReq(req);
    });
    // 6) Handle denial
    socket.on("requestDenied", ({ fromSocketId }) => {
      alert(`User ${fromSocketId.slice(-6)} denied your request.`);
    });

    return () => {
      socket.off("connect");
      socket.off("updateUserCount");
      socket.off("matchFound");
      socket.off("incomingRequest");
      socket.off("requestDenied");
    };
  }, []);

  // 7) When someone submits an interest, emit to server
  const handleInterestSubmit = (interest) => {
    socket.emit("submitInterest", { interest });
  };

  // 8) When manual‐match REST or auto match succeeds, start the call
  const handleManualMatch = ({ roomId }) => {
    setCallData({ roomId, isInitiator: true });
  };

  return (
    <Router basename="/Video-Call-WebApp">
      {/* Yes/No Modal */}
      {incomingReq && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg fixed top-0 right-0">
            <p className="mb-4">
              User {incomingReq.fromSocketId.slice(-6)} wants to connect
              (interest: <strong>{incomingReq.interest}</strong>).
            </p>
            <div className="flex justify-end space-x-4">
              <button
                className="px-4 py-2 bg-green-500 text-white rounded"
                onClick={async () => {
                  // YES: call manual match
                  await fetch(
                    `http://localhost:3000/api/interests/${incomingReq.requestId}/match`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ socketId: socket.id }),
                    }
                  );
                  setIncomingReq(null);
                }}
              >
                Yes
              </button>
              <button
                className="px-4 py-2 bg-red-500 text-white rounded"
                onClick={() => {
                  socket.emit("connectionResponse", {
                    targetSocketId: incomingReq.fromSocketId,
                    accepted: false,
                  });
                  setIncomingReq(null);
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      <Routes>
        <Route path="/login" element={<Login setAuth={setAuth} />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/"
          element={
            auth ? (
              <div className="bg-pink-100 min-h-screen min-w-full">
                <Navbar onlineCount={onlineCount} />
                <div className="flex flex-col">
                  {/* Left side: InterestForm + VideoCall or CameraPreview */}
                  <div className="flex-1 p-4">
                    <InterestForm
                      socket={socket}
                      onSubmit={handleInterestSubmit}
                      onInterestAccepted={(newRecord) =>
                        setMyInterestId(newRecord.id)
                      }
                    />
                    <div className="mt-6">
                      {callData ? (
                        <VideoCall callData={callData} socket={socket} />
                      ) : (
                        <CameraPreview />
                      )}
                    </div>
                  </div>
                  {/* Right side: ActiveInterests */}
                  <div className="w-full p-4">
                    <ActiveInterests
                      socket={socket}
                      onMatch={handleManualMatch}
                      myInterestId={myInterestId}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
