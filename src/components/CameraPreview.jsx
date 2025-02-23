import React, { useEffect, useRef } from "react";

function CameraPreview() {
  const videoRef = useRef(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current
            .play()
            .catch((err) =>
              console.error("Error playing camera preview:", err)
            );
        };
      })
      .catch((err) => console.error("Error accessing camera:", err));
  }, []);

  return (
    <div className="container p-5 text-center items-center justify-center flex flex-col min-w-screen md:mt-22">
      <video
        className="w-xs md:w-xl"
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ transform: "scaleX(-1)" }}
      />
      <h2>Your Camera Preview</h2>
    </div>
  );
}

export default CameraPreview;
