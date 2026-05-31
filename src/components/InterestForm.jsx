/* src/components/InterestForm.jsx */
import { useCallback, useEffect, useRef, useState } from "react";

const SUBMIT_TIMEOUT_MS = 90000;
const WAITING_MESSAGES = [
  { delay: 0, text: "Preparing matcher..." },
  { delay: 4000, text: "Generating your interest profile..." },
  {
    delay: 12000,
    text: "This may take up to a minute after the app has been idle.",
  },
];

export default function InterestForm({ socket, onSubmit, onInterestAccepted }) {
  const [interest, setInterest] = useState("");
  const [isDisabled, setIsDisabled] = useState(false);
  const [message, setMessage] = useState("");
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const startWaitingMessages = useCallback(() => {
    clearTimers();
    WAITING_MESSAGES.forEach(({ delay, text }) => {
      const timer = setTimeout(() => setMessage(text), delay);
      timersRef.current.push(timer);
    });
  }, [clearTimers]);

  const finishSubmit = useCallback(() => {
    clearTimers();
    setIsDisabled(false);
  }, [clearTimers]);

  useEffect(() => {
    socket.on("interestError", (payload) => {
      setMessage(
        "⚠️ " +
          (payload.message ||
            "Failed to generate embedding. Please submit again.")
      );
      finishSubmit();
    });

    return () => {
      clearTimers();
      socket.off("interestError");
    };
  }, [finishSubmit, socket, clearTimers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsDisabled(true);
    startWaitingMessages();

    const fallbackTimer = setTimeout(() => {
      setMessage("This is taking longer than expected. Please try again.");
      finishSubmit();
    }, SUBMIT_TIMEOUT_MS);
    timersRef.current.push(fallbackTimer);

    try {
      const result = await onSubmit?.(interest);
      if (!result?.success) {
        setMessage(
          "⚠️ " +
            (result?.message ||
              "Failed to generate embedding. Please submit again.")
        );
        finishSubmit();
        return;
      }

      setMessage(
        "✅ Your interest has been recorded. Please wait while we match you."
      );
      finishSubmit();
      if (onInterestAccepted) onInterestAccepted(result.interest);
    } catch (error) {
      console.error("Interest submission failed:", error);
      setMessage("This is taking longer than expected. Please try again.");
      finishSubmit();
    }
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
