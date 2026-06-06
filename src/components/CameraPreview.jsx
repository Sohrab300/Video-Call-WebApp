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
    <div className="mx-auto flex w-full flex-col items-center justify-center p-5 text-center md:mt-22">
      <div className="aspect-square w-full max-w-[22rem] overflow-hidden rounded bg-black md:max-w-[28rem]">
        <video
          className="h-full w-full object-contain"
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ transform: "scaleX(-1)" }}
        />
      </div>
      <h2>Your Camera Preview</h2>
    </div>
  );
}

export default CameraPreview;
