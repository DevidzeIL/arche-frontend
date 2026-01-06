import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { GrainBackground } from './GrainBackground';

interface MuseumLayoutProps {
  children: ReactNode;
  className?: string;
  withGrain?: boolean;
  grainIntensity?: 'subtle' | 'medium' | 'strong';
}

export function MuseumLayout({ 
  children, 
  className,
  withGrain = true,
  grainIntensity = 'subtle'
}: MuseumLayoutProps) {
  const content = (
    <div className={cn('min-h-screen', className)}>
      {children}
    </div>
  );

  if (withGrain) {
    return (
      <GrainBackground intensity={grainIntensity}>
        {content}
      </GrainBackground>
    );
  }

  return content;
}

