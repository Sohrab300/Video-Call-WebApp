import { useCallback, useEffect, useRef, useState } from "react";
import ChatBox from "./ChatBox"; // import ChatBox
import { ICE_SERVERS } from "../config";

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;

  return (
    isIOSDevice() ||
    /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
}

const CHAT_BUTTON_SIZE = 48;
const CHAT_VIEWPORT_PADDING = 16;
const CHAT_PANEL_HEIGHT_RATIO = 0.7;
const CHAT_PANEL_MOBILE_WIDTH_RATIO = 0.8;
const CHAT_PANEL_TABLET_WIDTH = 448;
const CHAT_PANEL_MAX_WIDTH = 512;
const CHAT_DRAG_THRESHOLD = 6;
const CHAT_DRAG_HINT_DELAY_MS = 1000;
const CHAT_DRAG_HINT_VISIBLE_MS = 5000;
const CHAT_DRAG_HINT = "Press and drag to move chat.";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function VideoCall({ callData, socket, onCallEnded }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);
  const pendingIceCandidates = useRef([]);
  const startCallRef = useRef(null);
  const localMediaStarted = useRef(false);
  const facingMode = useRef("user");
  const videoInputDevices = useRef([]);
  const activeVideoDeviceId = useRef(null);
  const incomingMessageTimerRef = useRef(null);
  const chatDragRef = useRef(null);
  const chatDragHintTimerRef = useRef(null);
  const [requiresManualStart] = useState(() => isIOSDevice());
  const [connectionState, setConnectionState] = useState("connecting");
  const [remoteMediaState, setRemoteMediaState] = useState("waiting");
  const [callStartNeeded, setCallStartNeeded] = useState(requiresManualStart);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(() => isMobileDevice());
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [lastIncomingMessage, setLastIncomingMessage] = useState(null);
  const [chatButtonPosition, setChatButtonPosition] = useState(null);
  const [isChatButtonDragging, setIsChatButtonDragging] = useState(false);
  const [showChatDragHint, setShowChatDragHint] = useState(false);

  const getDefaultChatButtonPosition = useCallback(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };

    return {
      x: window.innerWidth - CHAT_BUTTON_SIZE - CHAT_VIEWPORT_PADDING,
      y: window.innerHeight - CHAT_BUTTON_SIZE - CHAT_VIEWPORT_PADDING,
    };
  }, []);

  const clampChatButtonPosition = useCallback((position) => {
    if (typeof window === "undefined") return position;

    return {
      x: clamp(
        position.x,
        CHAT_VIEWPORT_PADDING,
        window.innerWidth - CHAT_BUTTON_SIZE - CHAT_VIEWPORT_PADDING
      ),
      y: clamp(
        position.y,
        CHAT_VIEWPORT_PADDING,
        window.innerHeight - CHAT_BUTTON_SIZE - CHAT_VIEWPORT_PADDING
      ),
    };
  }, []);

  const chatPanelStyle = (() => {
    if (typeof window === "undefined") return undefined;

    const buttonPosition = chatButtonPosition || getDefaultChatButtonPosition();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth =
      viewportWidth < 768
        ? viewportWidth * CHAT_PANEL_MOBILE_WIDTH_RATIO
        : Math.min(CHAT_PANEL_TABLET_WIDTH, CHAT_PANEL_MAX_WIDTH);
    const panelHeight = viewportHeight * CHAT_PANEL_HEIGHT_RATIO;
    const buttonCenterX = buttonPosition.x + CHAT_BUTTON_SIZE / 2;
    const preferredTop =
      buttonPosition.y > viewportHeight / 2
        ? buttonPosition.y - panelHeight - 12
        : buttonPosition.y + CHAT_BUTTON_SIZE + 12;

    return {
      left: `${clamp(
        buttonCenterX - panelWidth / 2,
        CHAT_VIEWPORT_PADDING,
        viewportWidth - panelWidth - CHAT_VIEWPORT_PADDING
      )}px`,
      top: `${clamp(
        preferredTop,
        CHAT_VIEWPORT_PADDING,
        viewportHeight - panelHeight - CHAT_VIEWPORT_PADDING
      )}px`,
      width: `${panelWidth}px`,
      height: `${panelHeight}px`,
    };
  })();

  const resumeRemoteVideo = () => {
    remoteVideoRef.current
      ?.play()
      .then(() => setRemoteMediaState("playing"))
      .catch((error) => {
        console.error("Error resuming remote video:", error);
        setRemoteMediaState("blocked");
      });
  };

  const showIncomingMessagePreview = (message) => {
    if (incomingMessageTimerRef.current) {
      clearTimeout(incomingMessageTimerRef.current);
    }

    setLastIncomingMessage(message);
    incomingMessageTimerRef.current = setTimeout(() => {
      setLastIncomingMessage(null);
      incomingMessageTimerRef.current = null;
    }, 5000);
  };

  const clearIncomingMessagePreview = () => {
    if (incomingMessageTimerRef.current) {
      clearTimeout(incomingMessageTimerRef.current);
      incomingMessageTimerRef.current = null;
    }
    setLastIncomingMessage(null);
  };

  const clearChatDragHint = () => {
    if (chatDragHintTimerRef.current) {
      clearTimeout(chatDragHintTimerRef.current);
      chatDragHintTimerRef.current = null;
    }
    setShowChatDragHint(false);
  };

  const openMobileChat = () => {
    setIsMobileChatOpen(true);
    clearIncomingMessagePreview();
    clearChatDragHint();
  };

  const handleChatButtonPointerDown = (event) => {
    const currentPosition =
      chatButtonPosition || getDefaultChatButtonPosition();

    chatDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: currentPosition.x,
      originY: currentPosition.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleChatButtonPointerMove = (event) => {
    const dragState = chatDragRef.current;
    if (!dragState) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const hasMoved =
      Math.abs(deltaX) > CHAT_DRAG_THRESHOLD ||
      Math.abs(deltaY) > CHAT_DRAG_THRESHOLD;

    if (hasMoved) {
      dragState.moved = true;
      setIsChatButtonDragging(true);
      clearChatDragHint();
    }

    if (!dragState.moved) return;

    setChatButtonPosition(
      clampChatButtonPosition({
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY,
      })
    );
  };

  const handleChatButtonPointerUp = () => {
    const dragState = chatDragRef.current;
    chatDragRef.current = null;
    setIsChatButtonDragging(false);

    if (dragState?.moved) return;
    openMobileChat();
  };

  useEffect(() => {
    setChatButtonPosition(getDefaultChatButtonPosition());

    const handleResize = () => {
      setChatButtonPosition((currentPosition) =>
        clampChatButtonPosition(
          currentPosition || getDefaultChatButtonPosition()
        )
      );
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [clampChatButtonPosition, getDefaultChatButtonPosition]);

  useEffect(() => {
    chatDragHintTimerRef.current = setTimeout(() => {
      setShowChatDragHint(true);
      chatDragHintTimerRef.current = setTimeout(() => {
        setShowChatDragHint(false);
        chatDragHintTimerRef.current = null;
      }, CHAT_DRAG_HINT_VISIBLE_MS);
    }, CHAT_DRAG_HINT_DELAY_MS);

    return () => clearChatDragHint();
  }, []);

  const startCallFromUserGesture = () => {
    startCallRef.current?.();
  };

  const restartConnection = useCallback(async () => {
    const pc = peerConnection.current;
    if (!pc || pc.signalingState !== "stable") return;

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socket.emit("offer", { offer, roomId: callData.roomId });
      setConnectionState("reconnecting");
    } catch (error) {
      console.error("Error restarting peer connection:", error);
    }
  }, [callData.roomId, socket]);

  const switchCamera = async () => {
    const pc = peerConnection.current;
    const currentStream = localStream.current;
    if (!pc || !currentStream || isSwitchingCamera) return;

    const devices = videoInputDevices.current;
    const currentDeviceIndex = devices.findIndex(
      (device) => device.deviceId === activeVideoDeviceId.current
    );
    const nextDevice =
      devices.length > 1
        ? devices[(currentDeviceIndex + 1) % devices.length]
        : null;
    const nextFacingMode = facingMode.current === "user" ? "environment" : "user";
    setIsSwitchingCamera(true);

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: nextDevice
          ? { deviceId: { exact: nextDevice.deviceId } }
          : { facingMode: { ideal: nextFacingMode } },
        audio: false,
      });
      const nextVideoTrack = nextStream.getVideoTracks()[0];
      if (!nextVideoTrack) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const sender = pc
        .getSenders()
        .find((item) => item.track && item.track.kind === "video");
      await sender?.replaceTrack(nextVideoTrack);

      currentStream.getVideoTracks().forEach((track) => {
        currentStream.removeTrack(track);
        track.stop();
      });
      currentStream.addTrack(nextVideoTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = currentStream;
        await localVideoRef.current.play();
      }

      activeVideoDeviceId.current =
        nextVideoTrack.getSettings().deviceId || nextDevice?.deviceId || null;
      facingMode.current = nextFacingMode;
    } catch (error) {
      console.error("Error switching camera:", error);
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let resolveLocalMediaReady;
    const localMediaReady = new Promise((resolve) => {
      resolveLocalMediaReady = resolve;
    });

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnection.current = pc;

    const flushPendingIceCandidates = async () => {
      if (!pc.remoteDescription) return;

      const queuedCandidates = pendingIceCandidates.current.splice(0);
      for (const candidate of queuedCandidates) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (error) {
          console.error("Error adding queued ICE candidate:", error);
        }
      }
    };

    // Set the ontrack callback to receive remote tracks.
    pc.ontrack = (event) => {
      console.log("Remote track event:", event);
      if (!remoteVideoRef.current) return;

      if (event.streams && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      } else {
        if (!remoteStream.current) remoteStream.current = new MediaStream();
        remoteStream.current.addTrack(event.track);
        remoteVideoRef.current.srcObject = remoteStream.current;
      }

      remoteVideoRef.current
        .play()
        .then(() => setRemoteMediaState("playing"))
        .catch((err) => {
          console.error("Error playing remote video:", err);
          setRemoteMediaState("blocked");
        });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Local ICE candidate:", event.candidate);
        socket.emit("iceCandidate", {
          candidate: event.candidate,
          roomId: callData.roomId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Peer connection state:", pc.connectionState);
      setConnectionState(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed" && pc.signalingState === "stable") {
        restartConnection();
      }
    };

    const handleOffer = async (data) => {
      try {
        console.log("Received offer:", data);
        await localMediaReady;
        if (!isMounted) return;

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushPendingIceCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { answer, roomId: callData.roomId });
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    };

    const handleAnswer = async (data) => {
      try {
        console.log("Received answer:", data);
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushPendingIceCandidates();
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    };

    const handleIceCandidate = async (data) => {
      if (!data.candidate) return;

      const candidate = new RTCIceCandidate(data.candidate);
      if (!pc.remoteDescription) {
        pendingIceCandidates.current.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    };

    const handleCallEnded = () => {
      onCallEnded?.();
    };

    // Register signaling listeners before getUserMedia so slow iPad/Safari
    // permission prompts do not miss an early offer from the initiator.
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("iceCandidate", handleIceCandidate);
    socket.on("callEnded", handleCallEnded);

    const startCall = async () => {
      if (localMediaStarted.current) return;
      localMediaStarted.current = true;
      setCallStartNeeded(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode.current } },
          audio: true,
        });
        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        console.log("Local stream obtained:", stream);
        localStream.current = stream;
        activeVideoDeviceId.current =
          stream.getVideoTracks()[0]?.getSettings().deviceId || null;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current
            .play()
            .catch((err) => console.error("Error playing local video:", err));
        }

        stream.getTracks().forEach((track) => {
          console.log("Adding local track:", track);
          pc.addTrack(track, stream);
        });

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          videoInputDevices.current = devices.filter(
            (device) => device.kind === "videoinput"
          );
          setCanSwitchCamera(
            isMobileDevice() || videoInputDevices.current.length > 1
          );
        } catch (error) {
          console.error("Error reading media devices:", error);
        }

        resolveLocalMediaReady();
      } catch (err) {
        console.error("Error accessing media devices.", err);
        resolveLocalMediaReady();
        return;
      }

      if (callData.isInitiator && pc.signalingState === "stable") {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          socket.emit("offer", { offer, roomId: callData.roomId });
        } catch (err) {
          console.error("Error creating offer:", err);
        }
      }
    };

    startCallRef.current = startCall;
    if (!requiresManualStart) startCall();

    // Cleanup on component unmount
    return () => {
      isMounted = false;
      startCallRef.current = null;
      localMediaStarted.current = false;
      clearIncomingMessagePreview();
      clearChatDragHint();
      localStream.current?.getTracks().forEach((track) => track.stop());
      pendingIceCandidates.current = [];
      pc.close();
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("iceCandidate", handleIceCandidate);
      socket.off("callEnded", handleCallEnded);
    };
  }, [callData, onCallEnded, requiresManualStart, restartConnection, socket]);

  const isRemoteVideoBlocked = remoteMediaState === "blocked";
  const isConnectionUnhealthy =
    connectionState === "failed" ||
    connectionState === "disconnected" ||
    connectionState === "reconnecting";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 text-center lg:min-h-[75vh] lg:flex-row lg:items-stretch lg:justify-center lg:gap-6">
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl lg:grid-cols-1">
        <div className="flex flex-col items-center">
          {callStartNeeded && (
            <button
              className="mb-3 rounded bg-green-500 px-4 py-2 text-white"
              onClick={startCallFromUserGesture}
            >
              Start call
            </button>
          )}
          <div className="relative aspect-square w-full max-w-[22rem] overflow-hidden rounded bg-black sm:max-w-[20rem] lg:max-w-[18rem]">
            <video
              className="h-full w-full object-contain"
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ transform: "scaleX(-1)" }}
            />
            {canSwitchCamera && (
              <button
                className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-2xl text-white backdrop-blur-sm transition hover:bg-black/35 disabled:opacity-50"
                onClick={switchCamera}
                disabled={callStartNeeded || isSwitchingCamera}
                aria-label="Switch camera"
                title="Switch camera"
              >
                ↻
              </button>
            )}
          </div>
          <h2>Your Camera Preview</h2>
        </div>
        <div className="flex flex-col items-center">
          <div className="aspect-square w-full max-w-[22rem] overflow-hidden rounded bg-black sm:max-w-[20rem] lg:max-w-[18rem]">
            <video
              className="h-full w-full object-contain"
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
          <h2>Buddy&apos;s Camera Preview</h2>
          <div className="mt-2 flex min-h-9 items-center justify-center gap-2 text-sm">
            <span className="rounded bg-pink-50 px-2 py-1">
              {connectionState}
            </span>
            {isRemoteVideoBlocked && (
              <button
                className="rounded bg-blue-500 px-3 py-1 text-white"
                onClick={resumeRemoteVideo}
              >
                Resume video
              </button>
            )}
            {isConnectionUnhealthy && (
              <button
                className="rounded bg-green-500 px-3 py-1 text-white"
                onClick={restartConnection}
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="hidden min-h-[24rem] w-full items-stretch justify-center lg:flex lg:min-h-0 lg:flex-1">
        <ChatBox
          socket={socket}
          roomId={callData.roomId}
          peerSocketId={callData.peerSocketId}
        />
      </div>
      <button
        className={`fixed z-40 flex h-12 w-12 touch-none select-none items-center justify-center rounded-full bg-blue-500 text-2xl text-white shadow-lg lg:hidden ${
          isChatButtonDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          left: `${(chatButtonPosition || getDefaultChatButtonPosition()).x}px`,
          top: `${(chatButtonPosition || getDefaultChatButtonPosition()).y}px`,
        }}
        onPointerDown={handleChatButtonPointerDown}
        onPointerMove={handleChatButtonPointerMove}
        onPointerUp={handleChatButtonPointerUp}
        onPointerCancel={() => {
          chatDragRef.current = null;
          setIsChatButtonDragging(false);
        }}
        aria-label="Open chat"
        title="Open chat"
      >
        💬
        {!isMobileChatOpen && lastIncomingMessage && (
          <span className="absolute bottom-full right-0 mb-3 max-w-[70vw] rounded bg-gray-200 px-3 py-2 text-left text-sm leading-5 text-gray-900 shadow">
            {lastIncomingMessage.text}
          </span>
        )}
        {!isMobileChatOpen && !lastIncomingMessage && showChatDragHint && (
          <span className="absolute bottom-full right-0 mb-3 w-[min(14rem,70vw)] rounded bg-gray-200 px-3 py-2 text-left text-sm leading-5 text-gray-900 shadow">
            {CHAT_DRAG_HINT}
          </span>
        )}
      </button>
      <div
        className={`fixed inset-0 z-50 bg-black/30 lg:hidden ${
          isMobileChatOpen ? "flex" : "hidden"
        }`}
      >
        <div
          className="fixed rounded-md bg-[#f7f2f3] shadow-xl"
          style={chatPanelStyle}
        >
          <button
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-xl text-gray-600 shadow hover:text-gray-900"
            onClick={() => setIsMobileChatOpen(false)}
            aria-label="Close chat"
            title="Close chat"
          >
            ×
          </button>
          <ChatBox
            socket={socket}
            roomId={callData.roomId}
            peerSocketId={callData.peerSocketId}
            onIncomingMessage={(message) => {
              if (!isMobileChatOpen) showIncomingMessagePreview(message);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default VideoCall;
