import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { resolveAssetUrl } from '../../utils/assetUrl';

/**
 * ProductCard — a light, registry-driven card for the login page's
 * "Our Products" section.
 *
 *  - Renders the configured name, description, logo and destination hostname.
 *  - A card is an actual link ONLY when the registry supplies a valid http(s)
 *    URL. Without one it stays a non-interactive <article> — no invented
 *    fallback destination, no dead link.
 *  - The current product gets the brand blue accent (blue + purple theme).
 *  - The logo is contained (never cropped/stretched) and falls back to the
 *    product's initials instead of a broken-image glyph.
 */
export default function ProductCard({ product, logoUrl = '', onExplore = null }) {
  const {
    name = '',
    description = '',
    url = '',
    logo = logoUrl,
    isCurrent = false,
  } = product || {};

  const [imgError, setImgError] = useState(false);
  const logoSrc = resolveAssetUrl(logo);

  // A replaced logo must get a fresh chance to load.
  useEffect(() => { setImgError(false); }, [logo]);

  // Only real web destinations are clickable — never a fabricated site.
  const rawUrl = typeof url === 'string' ? url.trim() : '';
  let destination = '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') destination = parsed.toString();
  } catch { destination = ''; }
  const hasDestination = Boolean(destination);
  const destinationLabel = (() => {
    if (!hasDestination) return '';
    try { return new URL(destination).hostname.replace(/^www\./, ''); } catch { return ''; }
  })();

  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const cardClass = `group flex h-full min-h-[154px] min-w-0 flex-col rounded-xl border bg-white p-3.5 text-left shadow-[0_10px_28px_-24px_rgba(15,23,42,0.35)] transition-all ${
    isCurrent
      ? 'border-[#0866E8] ring-1 ring-[#0866E8]/20'
      : 'border-slate-200 hover:border-[#0866E8]/40 hover:shadow-[0_14px_30px_-20px_rgba(8,102,232,0.35)]'
  }${hasDestination ? ' cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0866E8]/40' : ''}`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F0F6FF] p-1.5 ring-1 ring-[#0866E8]/10">
          {logoSrc && !imgError ? (
            <img
              src={logoSrc}
              alt={name ? `${name} logo` : 'Product logo'}
              className="max-h-full max-w-full object-contain"
              onError={() => setImgError(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-[11px] font-extrabold text-[#123EAA]">{initials}</span>
          )}
        </span>
        {isCurrent && (
          <span className="shrink-0 rounded-full bg-[#EEF4FF] px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-[#123EAA]">
            Current
          </span>
        )}
      </div>

      <h3 className="mt-2.5 line-clamp-2 text-[12px] font-extrabold leading-tight text-slate-800">
        {name}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[28px] text-[10px] font-medium leading-snug text-slate-500">
        {description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="min-w-0 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[#0866E8]">
          {hasDestination ? 'Visit product' : 'Infinixo product'}
        </span>
        {hasDestination && (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#0866E8] transition-transform group-hover:translate-x-0.5" />
        )}
      </div>
    </>
  );

  if (hasDestination) {
    return (
      <a
        href={destination}
        target="_blank"
        rel="noreferrer noopener"
        title={destinationLabel ? `${name} — ${destinationLabel}` : name}
        onClick={onExplore || undefined}
        aria-label={`${name}${destinationLabel ? ` — ${destinationLabel}` : ''} (opens in a new tab)`}
        className={cardClass}
      >
        {content}
      </a>
    );
  }

  return (
    <article className={cardClass} aria-label={name ? `${name} product` : 'Product'}>
      {content}
    </article>
  );
}
