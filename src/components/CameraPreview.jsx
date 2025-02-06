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
    <div className="container p-5 text-center flex flex-col justify-center items-center min-w-screen md:mt-22">
      <div className="w-xs md:w-xls bg-black">
        <video
          className="w-full h-full object-contain"
          ref={videoRef}
          autoPlay
          muted
          playsInline
        />
      </div>
      <h2>Your Camera Preview</h2>
    </div>
  );
}

export default CameraPreview;
