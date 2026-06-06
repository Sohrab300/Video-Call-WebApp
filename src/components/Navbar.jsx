import { useEffect, useRef, useState } from "react";
import ActiveInterests from "./ActiveInterests";

const logoSrc = `${import.meta.env.BASE_URL}logo-2.svg`;
const USERS_ONLINE_HINT_KEY = "usersOnlineHintSeen";
const USERS_ONLINE_HINT =
  "Click Users online to see who is waiting and send a connection request.";

const Navbar = ({ onlineCount, socket, myInterest, callData }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showUsersHint, setShowUsersHint] = useState(false);
  const dropdownRef = useRef(null);
  const usersHintTimerRef = useRef(null);

  const clearUsersHintTimer = () => {
    if (usersHintTimerRef.current) {
      clearTimeout(usersHintTimerRef.current);
      usersHintTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (sessionStorage.getItem(USERS_ONLINE_HINT_KEY)) return undefined;

    sessionStorage.setItem(USERS_ONLINE_HINT_KEY, "true");
    setShowUsersHint(true);

    usersHintTimerRef.current = setTimeout(() => {
      setShowUsersHint(false);
      usersHintTimerRef.current = null;
    }, 5000);

    return () => clearUsersHintTimer();
  }, []);

  useEffect(() => {
    if (!isDropdownOpen && !showUsersHint) return undefined;

    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
        setShowUsersHint(false);
        clearUsersHintTimer();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen, showUsersHint]);

  useEffect(() => {
    if (!callData) return;

    setIsDropdownOpen(false);
    setShowUsersHint(false);
    clearUsersHintTimer();
  }, [callData]);

  const togglePinnedHint = () => {
    clearUsersHintTimer();
    setShowUsersHint((current) => !current);
  };

  return (
    <div className="container flex min-h-[10vh] min-w-full items-center justify-between border-b-2 border-pink-500 bg-pink-200 px-4 py-3 sm:px-8 md:px-12">
      <div className="logo w-40 h-12 flex justify-center items-center text-3xl font-bold">
        <img src={logoSrc} alt="Logo" />
      </div>
      <div className="relative flex items-center gap-2" ref={dropdownRef}>
        <div className="relative">
          <button
            className="onluser flex min-h-10 w-fit items-center rounded-md bg-[#f7f2f3] p-2 text-left"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            aria-expanded={isDropdownOpen}
            aria-haspopup="true"
          >
            <span>Users online: {onlineCount}</span>
          </button>
          {showUsersHint && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded bg-gray-200 px-3 py-2 text-left text-sm leading-5 text-gray-900 shadow">
              {USERS_ONLINE_HINT}
            </div>
          )}
        </div>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-gray-700 shadow-sm hover:bg-white"
          onClick={togglePinnedHint}
          aria-label="Show users online help"
          title="Show help"
        >
          i
        </button>
        <div
          className={`absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-pink-200 bg-white p-4 text-left shadow-lg ${
            isDropdownOpen ? "block" : "hidden"
          }`}
        >
          <ActiveInterests
            socket={socket}
            myInterest={myInterest}
            onlineCount={onlineCount}
          />
        </div>
      </div>
    </div>
  );
};

export default Navbar;
