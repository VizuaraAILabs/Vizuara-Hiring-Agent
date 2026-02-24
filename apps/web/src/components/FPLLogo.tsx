import Image from 'next/image';

export default function FPLLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-white flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <Image
        src="/fpl-logo.png"
        alt="First Principle Labs"
        width={Math.round(size * 0.75)}
        height={Math.round(size * 0.75)}
        className="rounded-sm"
      />
    </div>
  );
}
