export default function FPLLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pi symbol */}
      <path
        d="M20 28H80M32 28V78M60 28V78"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Purple-blue wave accent through the middle */}
      <path
        d="M15 55C30 45 45 60 55 50C65 40 80 55 90 48"
        stroke="url(#fpl-wave)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <defs>
        <linearGradient id="fpl-wave" x1="15" y1="50" x2="90" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c5ce0" />
          <stop offset="100%" stopColor="#a8b4ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
