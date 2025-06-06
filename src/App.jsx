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
import ActiveInterests from "./components/ActiveInterests"; // import here
import VideoCall from "./components/VideoCall";
import CameraPreview from "./components/CameraPreview";
import Login from "./components/Login";
import Signup from "./components/SignUp";

// Initialize socket (update URL as needed)
const socket = io(
  "https://my-backend-service-257606194123.us-central1.run.app"
);

const MainApp = ({ socket, onlineCount, handleInterestSubmit, callData }) => {
  return (
    <div className="bg-pink-100 min-h-screen min-w-full">
      {/* Navbar always spans full width */}
      <Navbar onlineCount={onlineCount} />

      {/* 
        Below the navbar, we use a flex container:
        - Left side: InterestForm + either VideoCall or CameraPreview
        - Right side: ActiveInterests, pinned in the top-right area
      */}
      <div className="flex flex-col md:flex-row">
        {/* Left Column (main content) */}
        <div className="flex-1 p-4">
          <InterestForm onSubmit={handleInterestSubmit} />

          <div className="mt-6">
            {callData ? (
              <VideoCall callData={callData} socket={socket} />
            ) : (
              <CameraPreview />
            )}
          </div>
        </div>

        {/* Right Column (ActiveInterests) */}
        <div className="w-full md:w-1/3 p-4">
          <ActiveInterests />
        </div>
      </div>
    </div>
  );
};

function App() {
  // Manage authentication state (token and username)
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    return token ? { token, username } : null;
  });

  const [callData, setCallData] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);

  // Listen for live user count updates and matchFound events
  useEffect(() => {
    socket.on("updateUserCount", (count) => {
      setOnlineCount(count);
    });
    socket.on("matchFound", (data) => {
      console.log("Match found:", data);
      setCallData(data);
    });
    return () => {
      socket.off("updateUserCount");
      socket.off("matchFound");
    };
  }, []);

  const handleInterestSubmit = (interest) => {
    socket.emit("submitInterest", { interest });
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
              <MainApp
                socket={socket}
                onlineCount={onlineCount}
                handleInterestSubmit={handleInterestSubmit}
                callData={callData}
              />
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
