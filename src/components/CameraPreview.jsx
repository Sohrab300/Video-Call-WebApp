// src/components/CameraPreview.jsx
import React, { useEffect, useRef } from "react";

function CameraPreview() {
  const videoRef = useRef(null);

  useEffect(() => {
    // Request only video (or video and audio, if desired)
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        videoRef.current.srcObject = stream;
      })
      .catch((err) => console.error("Error accessing camera:", err));
  }, []);

  return (
    <div className="container p-5 text-center items-center justify-center flex flex-col min-w-screen md:mt-22 ">
      <video className="w-xs md:w-xl" ref={videoRef} autoPlay muted />
      <h2 className="">Your Camera Preview</h2>
    </div>
  );
}

export default CameraPreview;
