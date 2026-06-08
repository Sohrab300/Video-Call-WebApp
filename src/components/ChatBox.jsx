import { useState, useEffect, useRef } from "react";
import EmojiPicker from "emoji-picker-react";

const ChatBox = ({ messages, currentUserId, onSendMessage }) => {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // Send a message to the server
  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;

    onSendMessage(text);
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
    <div className="chat-box relative flex h-full max-h-[42rem] min-h-0 w-full max-w-lg flex-col rounded-md bg-[#f7f2f3] p-4">
      <div className="messages mb-4 min-h-0 flex-1 overflow-y-auto">
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
      <div className="input-group relative flex min-w-0" ref={chatInputRef}>
        <button
          className="shrink-0 border rounded-l px-2 py-2 border-r-0"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
        >
          🙂
        </button>
        <input
          type="text"
          className="min-w-0 flex-1 border border-l-0 p-2 focus:outline-none"
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button
          className="shrink-0 rounded-r bg-blue-500 px-3 py-2 text-white"
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
