import React from 'react';
import { cn } from '../../lib/utils';

export default function AppLogo({
  src,
  name = 'POS',
  size = 'md',
  className,
}) {
  const sizes = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-2xl',
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        className={cn('rounded-lg object-cover border border-slate-200', sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'bg-[#16A34A] rounded-lg flex items-center justify-center text-white font-extrabold shrink-0',
        sizes[size],
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
