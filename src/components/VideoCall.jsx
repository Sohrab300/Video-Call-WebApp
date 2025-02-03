// src/components/VideoCall.jsx
import React, { useEffect, useRef } from "react";

function VideoCall({ callData, socket }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);

  useEffect(() => {
    // Wrap everything in an async function so we can await getUserMedia and a delay
    const startCall = async () => {
      const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

      // Create the peer connection
      peerConnection.current = new RTCPeerConnection(config);

      // Set the ontrack callback to receive remote tracks
      peerConnection.current.ontrack = (event) => {
        console.log("Remote track event:", event);
        if (event.streams && event.streams[0]) {
          console.log("Remote stream received:", event.streams[0]);
          remoteVideoRef.current.srcObject = event.streams[0];
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
        // Get the local media stream and add its tracks
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("Local stream obtained:", stream);
        localVideoRef.current.srcObject = stream;
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

      // Set up the socket listeners for signaling

      // For the receiver: when an offer is received
      socket.on("offer", async (data) => {
        console.log("Received offer:", data);
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit("answer", { answer, roomId: callData.roomId });
      });

      // For the initiator: when an answer is received
      socket.on("answer", async (data) => {
        console.log("Received answer:", data);
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
      });

      // ICE candidate received from the remote peer
      socket.on("iceCandidate", (data) => {
        console.log("Received ICE candidate:", data);
        if (data.candidate) {
          peerConnection.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
      });

      // If this client is the initiator, create and send an offer now that tracks are added
      if (callData.isInitiator) {
        try {
          const offer = await peerConnection.current.createOffer();
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
    <>
      <div className="container p-5 text-center items-center justify-center flex gap-8 min-w-screen mt-22">
        <div className="flex flex-col justify-center items-center">
          {" "}
          <video className=" w-xl" ref={localVideoRef} autoPlay muted />
          <h2 className="">Your Camera Preview</h2>
        </div>
        <div className="flex flex-col justify-center items-center">
          <video className=" w-xl" ref={remoteVideoRef} autoPlay />
          <h2 className="">Buddy's Camera Preview</h2>
        </div>
      </div>
    </>
  );
}

export default VideoCall;
