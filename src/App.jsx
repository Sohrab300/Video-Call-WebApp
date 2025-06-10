// src/App.jsx
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

  useEffect(() => {
    // 3) As soon as socket connects, save our socket.id
    socket.on("connect", () => {
      localStorage.setItem("socketId", socket.id);
    });

    // 4) Listen for global user‐count updates
    socket.on("updateUserCount", (count) => {
      setOnlineCount(count);
    });

    // 5) Listen for matches
    socket.on("matchFound", (data) => {
      setCallData(data);
    });

    return () => {
      socket.off("connect");
      socket.off("updateUserCount");
      socket.off("matchFound");
    };
  }, []);

  // 6) When someone submits an interest, emit to server
  const handleInterestSubmit = (interest) => {
    socket.emit("submitInterest", { interest });
  };

  // 7) When manual‐match REST succeeds, start the call
  const handleManualMatch = ({ roomId }) => {
    setCallData({ roomId, isInitiator: true });
  };

  return (
    <Router basename="/Video-Call-WebApp">
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
