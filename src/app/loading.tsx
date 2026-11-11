
export default function Loading() {
  return (
    <main
      className="ef-loading-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="ef-chef" aria-hidden="true">
        <svg
          className="ef-chef-art"
          viewBox="0 0 240 250"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Chef's hat */}
          <g>
            <path
              d="M77 66c-13-5-18-17-12-29 5-10 17-14 28-10 5-17 21-25 37-19 10 4 16 12 18 23 14-4 28 5 30 19 2 8-2 15-8 20l-4 14H82z"
              fill="#fff"
              stroke="#1B6B28"
              strokeWidth="6"
              strokeLinejoin="round"
            />
            <path
              d="M82 70h88v20H82z"
              fill="#F2B544"
              stroke="#1B6B28"
              strokeWidth="5"
            />
          </g>

          {/* Face */}
          <path
            d="M76 88c0-10 8-18 18-18h64c10 0 18 8 18 18v55c0 29-22 52-50 52s-50-23-50-52z"
            fill="#F3C49B"
            stroke="#1B6B28"
            strokeWidth="6"
          />

          <path
            d="M99 119c5-7 13-7 18 0"
            fill="none"
            stroke="#26352A"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M137 119c5-7 13-7 18 0"
            fill="none"
            stroke="#26352A"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M111 148c8 10 22 10 30 0"
            fill="none"
            stroke="#9D4D35"
            strokeWidth="5"
            strokeLinecap="round"
          />

          <circle cx="89" cy="139" r="7" fill="#E99B83" opacity=".65" />
          <circle cx="165" cy="139" r="7" fill="#E99B83" opacity=".65" />

          {/* Jacket */}
          <path
            d="M67 190c12-13 30-20 53-20s41 7 53 20l19 42H48z"
            fill="#2E9E34"
            stroke="#1B6B28"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path d="m120 174 12 58h-24z" fill="#fff" />
          <circle cx="120" cy="203" r="4" fill="#F2B544" />
          <circle cx="120" cy="220" r="4" fill="#F2B544" />

          {/* Waving arm */}
          <g className="ef-chef-wave">
            <path
              d="M169 195c18-7 27-19 31-38l5-23c2-9 15-8 16 2l-2 31c-2 29-20 49-45 55z"
              fill="#F3C49B"
              stroke="#1B6B28"
              strokeWidth="6"
              strokeLinejoin="round"
            />
            <path
              d="M202 137c-5-12-3-23 2-31 4-7 13-5 14 3l1 15 8-12c5-7 14-2 11 6l-11 24z"
              fill="#F3C49B"
              stroke="#1B6B28"
              strokeWidth="5"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>

      <p className="ef-loading-title">
        Chef Fresh is getting things ready
      </p>

      <p className="ef-loading-subtitle">
        Fresh goodness, coming right up…
      </p>

      <div className="ef-loading-track" aria-hidden="true">
        <span />
      </div>

      <span className="ef-loading-sr">Loading Everfresh</span>
    </main>
  );
}
