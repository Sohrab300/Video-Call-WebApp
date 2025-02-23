import React, { useState, useEffect, useRef } from "react";
import EmojiPicker from "emoji-picker-react";

const ChatBox = ({ socket, roomId }) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // Get the current user's socket ID for message alignment
  const currentUserId = socket.id;

  // Listen for chat messages from the server
  useEffect(() => {
    const handleChatMessage = (data) => {
      setMessages((prev) => [...prev, data]);
    };

    socket.on("chatMessage", handleChatMessage);

    return () => {
      socket.off("chatMessage", handleChatMessage);
    };
  }, [socket]);

  // Send a message to the server
  const sendMessage = () => {
    if (!message.trim()) return;

    const messageData = {
      roomId,
      text: message,
      timestamp: new Date().toISOString(),
      sender: currentUserId, // include sender info
    };

    socket.emit("chatMessage", messageData);
    setMessages((prev) => [...prev, messageData]);
    setMessage("");
    setShowEmojiPicker(false);
  };

  // Auto-scroll to the bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyPress = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  // When an emoji is selected, append it to the current message
  const onEmojiClick = (emojiData) => {
    setMessage((prev) => prev + emojiData.emoji);
  };

  // Close emoji picker when clicking outside the input group
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        chatInputRef.current &&
        !chatInputRef.current.contains(event.target)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener("click", handleClickOutside);
    } else {
      document.removeEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showEmojiPicker]);

  return (
    <div className="chat-box bg-[#f7f2f3] rounded-md p-4 max-w-lg w-full h-[85%] relative">
      <div className="messages h-[87%] overflow-y-scroll mb-4">
        {messages.map((msg, index) => {
          const isCurrentUser = msg.sender === currentUserId;
          return (
            <div
              key={index}
              className={`message p-2 my-1 rounded w-fit max-w-full break-words ${
                isCurrentUser ? "ml-auto bg-blue-200" : "mr-auto bg-gray-200"
              }`}
            >
              <span>{msg.text}</span>
              <div className="text-xs text-gray-500">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-group flex relative" ref={chatInputRef}>
        <button
          className="border rounded-l py-2 pl-2.5 border-r-0"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
        >
          🙂
        </button>
        <input
          type="text"
          className="border p-2 border-l-0 flex-grow focus:outline-none"
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button
          className="bg-blue-500 text-white p-2 rounded-r"
          onClick={sendMessage}
        >
          Send
        </button>
        {showEmojiPicker && (
          <div className="absolute bottom-12 right-0 z-10">
            <EmojiPicker onEmojiClick={onEmojiClick} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatBox;
