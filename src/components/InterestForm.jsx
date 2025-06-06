import React, { useState } from "react";

function InterestForm({ onSubmit }) {
  const [interest, setInterest] = useState("");
  const [isDisabled, setIsDisabled] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsDisabled(true);
    setMessage(""); // Clear previous message

    try {
      const res = await fetch(
        "https://my-backend-service-257606194123.us-central1.run.app/api/interests",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ interest }),
        }
      );

      const data = await res.json();

      if (res.ok && data.embedding) {
        setMessage(
          "✅ Your interest has been recorded. Please wait while we match you."
        );
        onSubmit && onSubmit(interest); // Only call if passed
      } else {
        setMessage("⚠️ Something went wrong. Please submit again.");
        setIsDisabled(false); // Re-enable immediately if failed
        return;
      }
    } catch (err) {
      console.error("Error submitting interest:", err);
      setMessage("⚠️ Could not reach the server. Please try again.");
      setIsDisabled(false); // Re-enable on network failure
      return;
    }

    // Re-enable after 5 seconds if successful
    setTimeout(() => {
      setIsDisabled(false);
    }, 5000);

    setInterest(""); // Clear input
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

export default InterestForm;
