// src/components/InterestForm.jsx
import React, { useState, useEffect } from "react";

export default function InterestForm({ socket }) {
  const [interest, setInterest] = useState("");
  const [isDisabled, setIsDisabled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Listen for server acknowledgement
    socket.on("interestAccepted", (_data) => {
      setMessage(
        "✅ Your interest has been recorded. Please wait while we match you."
      );
      // Re‐enable submit button in a few seconds:
      setTimeout(() => setIsDisabled(false), 5000);
    });

    socket.on("interestError", (payload) => {
      setMessage(
        "⚠️ " +
          (payload.message ||
            "Failed to generate embedding. Please submit again.")
      );
      setIsDisabled(false);
    });

    return () => {
      socket.off("interestAccepted");
      socket.off("interestError");
    };
  }, [socket]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsDisabled(true);
    setMessage("");

    // Get our socket ID
    const socketId = socket.id || localStorage.getItem("socketId");
    if (!socketId) {
      setMessage("⚠️ Unable to get your socket ID. Please refresh.");
      setIsDisabled(false);
      return;
    }

    // Emit only ONCE. The server will respond with either "interestAccepted" or "interestError".
    socket.emit("submitInterest", { interest });
  };

  return (
    <div className="flex flex-col justify-center items-center mt-4 md:mt-12">
      <form
        className="flex flex-col justify-center items-center gap-2 md:block"
        onSubmit={handleSubmit}
      >
        <label className="font-bold" htmlFor="interest">
          Enter your interest or hobby:
        </label>
        <span>
          <input
            type="text"
            id="interest"
            value={interest}
            className="bg-pink-50 rounded-md mx-2"
            onChange={(e) => setInterest(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={isDisabled}
            className={`p-1 rounded-md ${
              isDisabled ? "bg-gray-400 cursor-not-allowed" : "bg-pink-400"
            }`}
          >
            {isDisabled ? "Please wait..." : "Submit"}
          </button>
        </span>
      </form>
      {message && <p className="mt-2 text-center">{message}</p>}
    </div>
  );
}
