import React from "react";

const Navbar = ({ onlineCount }) => {
  return (
    <div className="container flex justify-between items-center px-12 min-w-full bg-pink-200 h-[10vh]">
      <div className="logo w-40 h-12 flex justify-center items-center text-3xl font-bold">
        <img src="src/assets/logo-2.svg" alt="Logo" />
      </div>
      <div className="onluser flex items-center h-[50%] w-fit rounded-md bg-[#f7f2f3] p-2">
        <span>Users online: {onlineCount}</span>
      </div>
    </div>
  );
};

export default Navbar;
