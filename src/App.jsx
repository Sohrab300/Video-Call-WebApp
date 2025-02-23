import React, { useState, useEffect } from "react";
import InterestForm from "./components/InterestForm";
import VideoCall from "./components/VideoCall";
import io from "socket.io-client";
import CameraPreview from "./components/CameraPreview";
import Navbar from "./components/Navbar";

// Connect to the backend server on port 3000
const socket = io("http://localhost:3000"); //https://video-call-webapp-r9a2.onrender.com

function App() {
  const [callData, setCallData] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    // Listen for user count updates from the server
    socket.on("updateUserCount", (count) => {
      setOnlineCount(count);
    });

    // Cleanup the listener on unmount
    return () => {
      socket.off("updateUserCount");
    };
  }, []);

  // Listen for the matchFound event
  useEffect(() => {
    socket.on("matchFound", (data) => {
      console.log("Match found:", data);
      setCallData(data);
    });

    // Cleanup the event listener when the component unmounts
    return () => socket.off("matchFound");
  }, []);

  const handleInterestSubmit = (interest) => {
    // Sends the interest to the backend
    socket.emit("submitInterest", { interest });
  };

  return (
    <>
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
    </>
  );
}

export default App;
