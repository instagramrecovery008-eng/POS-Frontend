import React, { useEffect, useState } from 'react';
import { BRAND } from '../../config/company';
import { cn } from '../../lib/utils';

/**
 * Shared QWIKOUT POS logo.
 *
 *  - Always uses the single official asset from `BRAND.logo` (public folder),
 *    so every screen shares one file.
 *  - `object-contain` keeps the 3:1 wordmark perfectly proportional at every
 *    size — the logo is never stretched, cropped or distorted.
 *  - `surface` renders the logo on a neutral white plate, which keeps the
 *    blue/purple artwork legible on dark navigation rails. On light
 *    backgrounds (and the login brand panel) use `surface="none"`.
 *  - Sizing is entirely responsive: pass a width/height pair through
 *    `className` (e.g. `h-14 w-48 sm:h-16 sm:w-56`); the image scales to fit.
 *  - If the asset cannot load, nothing is rendered — never a broken-image
 *    glyph and never a text recreation of the logo.
 */
export default function BrandLogo({
  surface = 'none',
  className,
  imgClassName,
  alt = BRAND.logoAlt,
  priority = false,
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, []);

  if (failed) return null;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        surface !== 'none' && 'rounded-2xl p-2',
        surface === 'light' && 'bg-white ring-1 ring-slate-900/5',
        surface === 'dark' && 'bg-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.65)] ring-1 ring-white/20',
        className
      )}
    >
      <img
        src={BRAND.logo}
        alt={alt}
        draggable={false}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('block max-h-full max-w-full object-contain', imgClassName)}
      />
    </span>
  );
}
