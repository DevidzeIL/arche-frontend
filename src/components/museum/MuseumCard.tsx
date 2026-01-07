import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MuseumCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'subtle' | 'ghost';
  size?: 'default' | 'sm';
  onClick?: () => void;
}

export function MuseumCard({ 
  children, 
  className, 
  variant = 'default',
  size = 'default',
  onClick 
}: MuseumCardProps) {
  const variantStyles = {
    default: 'bg-card border border-border/30 hover:border-primary/50 hover:shadow-md',
    elevated: 'bg-card border border-primary/60 shadow-xl',
    subtle: 'bg-card/50 border border-border/20 hover:border-primary/40 hover:bg-secondary/10',
    ghost: 'bg-transparent border border-dashed border-border/15 hover:bg-secondary/5 hover:border-primary/30',
  };
  
  const sizeStyles = {
    default: 'p-6',
    sm: 'p-4',
  };

  return (
    <div
      className={cn(
        'rounded-lg transition-all duration-300',
        variantStyles[variant],
        sizeStyles[size],
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

