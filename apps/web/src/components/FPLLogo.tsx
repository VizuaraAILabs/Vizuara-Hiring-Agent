import Image from 'next/image';

export default function FPLLogo({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/fpl-logo.png"
      alt="First Principle Labs"
      width={size}
      height={size}
      className="brightness-0 invert"
    />
  );
}
