import { useEffect, useRef } from "react";

function CameraPreview() {
  const videoRef = useRef(null);

  useEffect(() => {
    let stream;
    let isMounted = true;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((mediaStream) => {
        stream = mediaStream;
        if (!isMounted || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
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

    return () => {
      isMounted = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="container p-5 text-center items-center justify-center flex flex-col min-w-screen md:mt-22">
      <video
        className="w-xs md:w-md"
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
