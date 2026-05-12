import ArcSpinner from '@/components/ArcSpinner';

interface ConcentricArcLoaderProps {
  label?: string;
}

export default function ConcentricArcLoader({ label = 'Loading challenges' }: ConcentricArcLoaderProps) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-white/5 bg-surface/60 px-6 py-12">
      <ArcSpinner label={label} sizeClassName="h-20 w-20" />
      <p className="mt-5 text-sm text-neutral-500">{label}</p>
    </div>
  );
}
