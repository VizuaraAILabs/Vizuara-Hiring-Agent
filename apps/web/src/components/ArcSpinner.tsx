interface ArcSpinnerProps {
  label?: string;
  sizeClassName?: string;
  className?: string;
}

export default function ArcSpinner({
  label = 'Loading',
  sizeClassName = 'h-10 w-10',
  className = '',
}: ArcSpinnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={`${sizeClassName} ${className}`}
      role="status"
      aria-label={label}
    >
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#39FF14"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="150 101.3"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 50 50"
          to="360 50 50"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>
      <circle
        cx="50"
        cy="50"
        r="28"
        fill="none"
        stroke="#39FF14"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="110 65.9"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="360 50 50"
          to="0 50 50"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </circle>
      <circle
        cx="50"
        cy="50"
        r="16"
        fill="none"
        stroke="#39FF14"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="55 45.5"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 50 50"
          to="360 50 50"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
