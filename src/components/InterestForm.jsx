// src/components/InterestForm.jsx
import React, { useState } from "react";

function InterestForm({ onSubmit }) {
  const [interest, setInterest] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Call the onSubmit prop passed from the parent
    onSubmit(interest);
  };

  return (
    <div className="flex justify-center items-center mt-8">
      <form onSubmit={handleSubmit}>
        <label className="font-bold" htmlFor="interest">
          Enter your interest or hobby:
        </label>
        <input
          type="text"
          id="interest"
          value={interest}
          className=" bg-pink-50 rounded-md mx-2"
          onChange={(e) => setInterest(e.target.value)}
          required
        />
        <button className="bg-pink-400 p-1 rounded-md" type="submit">
          Submit
        </button>
      </form>
    </div>
  );
}

export default InterestForm;
