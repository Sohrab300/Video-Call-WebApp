import React, { useState, useEffect } from "react";
import InterestForm from "./components/InterestForm";
import VideoCall from "./components/VideoCall";
import io from "socket.io-client";
import CameraPreview from "./components/CameraPreview";

// Connect to the backend server on port 3000
const socket = io("https://video-call-webapp-r9a2.onrender.com");

function App() {
  const [callData, setCallData] = useState(null);

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
    // Emit the interest to the backend
    socket.emit("submitInterest", { interest });
  };

  return (
    <>
      <div className="container bg-pink-100 min-h-screen min-w-full">
        <div className="header flex justify-center items-center text-5xl font-bold h-[10vh]">
          <h1>
            Golmaal<span className="text-pink-500">.org</span>
          </h1>
        </div>
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
