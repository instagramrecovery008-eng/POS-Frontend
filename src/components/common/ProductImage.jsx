import React, { useState, useEffect } from 'react';
import { PLACEHOLDER_IMAGE } from '../../lib/imagePlaceholder';
import { optimizedImageUrl } from '../../utils/assetUrl';

/**
 * Product photo with a consistent presentation everywhere:
 *  - object-contain on a white field (a product is never cropped or stretched)
 *  - lazy loading + async decoding, optimized/cached CDN rendition
 *  - one professional neutral fallback if there is no image or it fails to load
 *
 * The parent controls the box size (className sets height/width); the image
 * always fits inside it.
 */
export default function ProductImage({ src, alt = '', width = 400, className = '' }) {
  const [failed, setFailed] = useState(false);

  // A new product / new URL gets a fresh chance to load.
  useEffect(() => { setFailed(false); }, [src]);

  const hasImage = !!src && src !== PLACEHOLDER_IMAGE && !failed;
  const url = hasImage ? optimizedImageUrl(src, width) : PLACEHOLDER_IMAGE;

  return (
    <div className={`bg-white flex items-center justify-center overflow-hidden ${className}`}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailed(true)}
        className={`max-w-full max-h-full w-full h-full ${hasImage ? 'object-contain p-1.5' : 'object-cover'}`}
      />
    </div>
  );
}
