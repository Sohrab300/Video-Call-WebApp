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
import VideoCall from "./components/VideoCall";
import CameraPreview from "./components/CameraPreview";
import Login from "./components/Login";
import Signup from "./components/SignUp";

// Initialize socket (update URL as needed)
const socket = io("https://video-call-webapp-r9a2.onrender.com");

const MainApp = ({ socket, onlineCount, handleInterestSubmit, callData }) => {
  return (
    <div className="container bg-pink-100 min-h-screen min-w-full">
      <Navbar onlineCount={onlineCount} />
      <div className="App">
        <InterestForm onSubmit={handleInterestSubmit} />
        {callData ? (
          <VideoCall callData={callData} socket={socket} />
        ) : (
          <CameraPreview />
        )}
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
