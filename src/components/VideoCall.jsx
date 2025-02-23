import React, { useEffect, useRef } from "react";
import ChatBox from "./ChatBox"; // import ChatBox

function VideoCall({ callData, socket }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);

  useEffect(() => {
    const startCall = async () => {
      const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

      // Create the peer connection
      peerConnection.current = new RTCPeerConnection(config);

      // Set the ontrack callback to receive remote tracks
      peerConnection.current.ontrack = (event) => {
        console.log("Remote track event:", event);
        if (event.streams && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.onloadedmetadata = () => {
            remoteVideoRef.current
              .play()
              .catch((err) =>
                console.error("Error playing remote video:", err)
              );
          };
        }
      };

      // Handle ICE candidates generated locally
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Local ICE candidate:", event.candidate);
          socket.emit("iceCandidate", {
            candidate: event.candidate,
            roomId: callData.roomId,
          });
        }
      };

      try {
        // Get the local media stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("Local stream obtained:", stream);

        // Clone the stream for local preview
        const localPreviewStream = stream.clone();
        localVideoRef.current.srcObject = localPreviewStream;
        localVideoRef.current.onloadedmetadata = () => {
          localVideoRef.current
            .play()
            .catch((err) => console.error("Error playing local video:", err));
        };

        // Add the original stream's tracks to the peer connection
        stream.getTracks().forEach((track) => {
          console.log("Adding local track:", track);
          peerConnection.current.addTrack(track, stream);
        });

        // Wait briefly to ensure tracks are fully added
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err) {
        console.error("Error accessing media devices.", err);
        return;
      }

      // Socket listeners for signaling
      socket.on("offer", async (data) => {
        console.log("Received offer:", data);
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit("answer", { answer, roomId: callData.roomId });
      });

      socket.on("answer", async (data) => {
        console.log("Received answer:", data);
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
      });

      socket.on("iceCandidate", (data) => {
        console.log("Received ICE candidate:", data);
        if (data.candidate) {
          peerConnection.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
      });

      // If initiator, create and send an offer
      if (callData.isInitiator) {
        try {
          const offer = await peerConnection.current.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await peerConnection.current.setLocalDescription(offer);
          socket.emit("offer", { offer, roomId: callData.roomId });
        } catch (err) {
          console.error("Error creating offer:", err);
        }
      }
    };

    startCall();

    // Cleanup on component unmount
    return () => {
      if (peerConnection.current) peerConnection.current.close();
      socket.off("offer");
      socket.off("answer");
      socket.off("iceCandidate");
    };
  }, [callData, socket]);

  return (
    <div className="container h-[75vh] p-5 text-center items-center justify-center flex flex-col md:flex-row gap-4 md:gap-8 min-w-screen md:mt-10">
      <div className="flex flex-col">
        <div className="flex flex-col justify-center items-center">
          <video
            className="w-2xs md:w-[50%]"
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ transform: "scaleX(-1)" }}
          />
          <h2>Your Camera Preview</h2>
        </div>
        <div className="flex flex-col justify-center items-center">
          <video
            className="w-2xs md:w-[50%]"
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ transform: "scaleX(-1)" }}
          />
          <h2>Buddy's Camera Preview</h2>
        </div>
      </div>
      <div className="h-[100%] w-[50%] flex items-center justify-center">
        <ChatBox socket={socket} roomId={callData.roomId} />
      </div>
    </div>
  );
}

export default VideoCall;
