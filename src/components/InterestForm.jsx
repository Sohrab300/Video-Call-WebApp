/* src/components/InterestForm.jsx */
import React, { useState, useEffect } from "react";

export default function InterestForm({ socket, onSubmit, onInterestAccepted }) {
  const [interest, setInterest] = useState("");
  const [isDisabled, setIsDisabled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    socket.on("interestAccepted", ({ interest: newRecord }) => {
      setMessage(
        "✅ Your interest has been recorded. Please wait while we match you."
      );
      setTimeout(() => setIsDisabled(false), 5000);
      // Now pass the actual DB record so newRecord.id is defined
      if (onInterestAccepted) onInterestAccepted(newRecord);
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
  }, [socket, onInterestAccepted]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsDisabled(true);
    setMessage("");

    // Delegate emitting to parent
    if (onSubmit) onSubmit(interest);
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
