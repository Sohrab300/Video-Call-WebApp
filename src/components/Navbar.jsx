import { useEffect, useRef, useState } from "react";
import ActiveInterests from "./ActiveInterests";

const logoSrc = `${import.meta.env.BASE_URL}logo-2.svg`;

const Navbar = ({ onlineCount, socket, myInterest }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isDropdownOpen) return undefined;

    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  return (
    <div className="container flex min-h-[10vh] min-w-full items-center justify-between border-b-2 border-pink-500 bg-pink-200 px-4 py-3 sm:px-8 md:px-12">
      <div className="logo w-40 h-12 flex justify-center items-center text-3xl font-bold">
        <img src={logoSrc} alt="Logo" />
      </div>
      <div className="relative" ref={dropdownRef}>
        <button
          className="onluser flex min-h-10 w-fit items-center rounded-md bg-[#f7f2f3] p-2 text-left"
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          aria-expanded={isDropdownOpen}
          aria-haspopup="true"
        >
          <span>Users online: {onlineCount}</span>
        </button>
        {isDropdownOpen && (
          <div className="absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-pink-200 bg-white p-4 text-left shadow-lg">
            <ActiveInterests
              socket={socket}
              myInterest={myInterest}
              onlineCount={onlineCount}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Navbar;
