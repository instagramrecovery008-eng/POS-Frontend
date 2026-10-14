import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Tenant logo mark used by the sidebar (and anywhere else a compact, square
 * restaurant avatar is needed).
 *
 * Behaviour:
 *  - A configured logo URL is rendered INSIDE a fixed square shell with
 *    `object-contain`, so any aspect ratio (square icon, wide wordmark, tall
 *    graphic) is shown undistorted and can never overflow or shift the layout.
 *  - A missing (empty) or FAILED source falls back to the restaurant's initial
 *    — never the browser's broken-image glyph.
 *  - `shrink-0` + a fixed size mean the adjacent restaurant name keeps its
 *    alignment in the rail, the expanded sidebar and the mobile drawer.
 *  - The failure flag resets whenever the URL changes, so a corrected logo is
 *    picked up without a full page reload (settings store updates swap tenants).
 */
const SIZES = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-2xl',
};

export default function AppLogo({
  src,
  name = 'POS',
  size = 'md',
  className,
}) {
  const sizeClass = SIZES[size] || SIZES.md;
  const [failed, setFailed] = useState(false);
  const url = typeof src === 'string' ? src.trim() : '';

  // A new source always gets a fresh chance to load.
  useEffect(() => { setFailed(false); }, [url]);

  const displayName = String(name || 'POS').trim() || 'POS';
  const initial = displayName.charAt(0).toUpperCase();

  const shellClass = cn(
    'shrink-0 rounded-lg aspect-square overflow-hidden flex items-center justify-center',
    sizeClass,
    className
  );

  if (url && !failed) {
    return (
      <span className={cn(shellClass, 'bg-white border border-slate-200')}>
        <img
          src={url}
          alt={`${displayName} logo`}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="w-full h-full object-contain"
        />
      </span>
    );
  }

  // Fallback mark: the restaurant's initial on the theme accent.
  return (
    <span
      role="img"
      aria-label={`${displayName} logo`}
      className={cn(shellClass, 'bg-[#16A34A] text-white font-extrabold select-none')}
    >
      {initial}
    </span>
  );
}
