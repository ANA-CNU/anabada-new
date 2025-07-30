import React from "react";

function Header() {
  return (
    <header className="w-full h-[12px] bg-transparent rounded-xl flex items-center justify-between px-20 mx-auto mt-6 mb-10">
      <a href="https://anacnu.kr" target="_blank" rel="noopener noreferrer">
        <span className="text-lg font-bold tracking-widest text-white cursor-pointer">ANA</span>
      </a>
      <a href="https://github.com/ANA-CNU/anabada-new" target="_blank" rel="noopener noreferrer">
        <img src="/logo-github-w.png" alt="github logo" className="h-7 w-7 object-contain cursor-pointer" />
      </a>
    </header>
  );
}

export default Header; 