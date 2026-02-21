export default function VizuaraLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="50" cy="28" rx="10" ry="22" fill="#e040e0" transform="rotate(0 50 50)" />
      <ellipse cx="50" cy="28" rx="10" ry="22" fill="#40b8e0" transform="rotate(60 50 50)" />
      <ellipse cx="50" cy="28" rx="10" ry="22" fill="#e8a030" transform="rotate(120 50 50)" />
      <ellipse cx="50" cy="28" rx="10" ry="22" fill="#e040e0" transform="rotate(180 50 50)" />
      <ellipse cx="50" cy="28" rx="10" ry="22" fill="#40b8e0" transform="rotate(240 50 50)" />
      <ellipse cx="50" cy="28" rx="10" ry="22" fill="#e8a030" transform="rotate(300 50 50)" />
      <circle cx="50" cy="50" r="10" fill="#9050c0" opacity="0.6" />
    </svg>
  );
}
