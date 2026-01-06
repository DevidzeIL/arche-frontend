import { ReactNode } from 'react';

interface GrainBackgroundProps {
  children: ReactNode;
  intensity?: 'subtle' | 'medium' | 'strong';
}

export function GrainBackground({ children, intensity = 'subtle' }: GrainBackgroundProps) {
  const opacityMap = {
    subtle: 0.02,
    medium: 0.04,
    strong: 0.06,
  };

  return (
    <div className="relative">
      {/* Зерно через CSS фильтр */}
      <div
        className="fixed inset-0 pointer-events-none z-[9999]"
        style={{
          opacity: opacityMap[intensity],
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      {children}
    </div>
  );
}

