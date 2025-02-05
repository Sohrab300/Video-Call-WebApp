import React, { useState } from "react";

function InterestForm({ onSubmit }) {
  const [interest, setInterest] = useState("");
  const [isDisabled, setIsDisabled] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(interest);

    setIsDisabled(true);

    setTimeout(() => {
      setIsDisabled(false);
    }, 2000);
  };

  return (
    <div className="flex justify-center items-center mt-4 md:mt-8">
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
              isDisabled ? "bg-gray-400" : "bg-pink-400"
            }`}
          >
            Submit
          </button>
        </span>
      </form>
    </div>
  );
}

export default InterestForm;
