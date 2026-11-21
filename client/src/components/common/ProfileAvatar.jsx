import { useEffect, useState } from 'react';

export default function ProfileAvatar({ userId, name, imageUrl, size = 'md', className = '' }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = size === 'lg' ? 'h-24 w-24 text-2xl' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm';
  const initials = String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const src = imageUrl || (userId ? `/api/profile/photo/${encodeURIComponent(userId)}?t=${Date.now()}` : null);

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [src]);

  return (
    <div className={`relative ${sizeClass} shrink-0 overflow-hidden rounded-full bg-brand-100 ${className}`} aria-label={name ? `${name} profile photo` : 'Profile photo'}>
      {src && !imageFailed ? (
        <img
          key={src}
          src={src}
          alt={name ? `${name} profile photo` : 'Profile photo'}
          className="absolute inset-0 h-full w-full object-cover"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {(!src || imageFailed || !imageLoaded) && (
        <span
          className="absolute inset-0 flex h-full w-full items-center justify-center font-semibold text-brand-700"
          aria-hidden="true"
        >
          {initials || 'U'}
        </span>
      )}
    </div>
  );
}
