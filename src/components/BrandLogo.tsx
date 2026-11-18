type Props = {
  className?: string
  title?: string
}

/** 瞬看品牌标：播放键 + 一瞬闪光 */
export function BrandLogo({ className = "h-10 w-10", title = "瞬看" }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="skLogoBg" x1="18" y1="8" x2="112" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fe2c55" />
          <stop offset="0.48" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#25f4ee" />
        </linearGradient>
        <linearGradient id="skLogoSheen" x1="24" y1="20" x2="96" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="32" fill="#0c0a10" />
      <rect x="8" y="8" width="112" height="112" rx="28" fill="url(#skLogoBg)" />
      <rect x="8" y="8" width="112" height="112" rx="28" fill="url(#skLogoSheen)" />
      <path
        d="M86 34c1.4-3.2 6.2-3.2 7.6 0l3.2 7.4c.4 1 1.3 1.8 2.4 2.1l7.8 2.1c3.4.9 3.4 5.7 0 6.6l-7.8 2.1c-1.1.3-2 1.1-2.4 2.1l-3.2 7.4c-1.4 3.2-6.2 3.2-7.6 0l-3.2-7.4c-.4-1-1.3-1.8-2.4-2.1l-7.8-2.1c-3.4-.9-3.4-5.7 0-6.6l7.8-2.1c1.1-.3 2-1.1 2.4-2.1L86 34z"
        fill="#ffffff"
        fillOpacity="0.92"
      />
      <path
        d="M48 40.5c0-3.2 3.4-5.2 6.2-3.6l36.2 20.5c2.9 1.6 2.9 5.6 0 7.3L54.2 85.1c-2.8 1.6-6.2-.4-6.2-3.6V40.5z"
        fill="#ffffff"
      />
    </svg>
  )
}
