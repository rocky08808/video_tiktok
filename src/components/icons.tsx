type IconProps = {
  className?: string
}

export function IconHeart({ filled, className = "h-8 w-8" }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12.1 20.3 4.4 13.2a4.8 4.8 0 0 1 0-7 4.9 4.9 0 0 1 6.9 0l.8.8.8-.8a4.9 4.9 0 0 1 6.9 0 4.8 4.8 0 0 1 0 7l-7.7 7.1Z"
        fill={filled ? "var(--dy)" : "rgba(255,255,255,.18)"}
        stroke={filled ? "var(--dy)" : "#fff"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconComment({ className = "h-8 w-8" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d="M6 6.2A3.2 3.2 0 0 1 9.2 3h5.6A3.2 3.2 0 0 1 18 6.2v5.1a3.2 3.2 0 0 1-3.2 3.2H12l-3.1 2.8c-.7.6-1.9.1-1.9-.8v-2H9.2A3.2 3.2 0 0 1 6 11.3V6.2Z"
        fill="rgba(255,255,255,.18)"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconBookmark({ filled, className = "h-8 w-8" }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M7 3.8h10A1.5 1.5 0 0 1 18.5 5.3v15.2L12 16.6 5.5 20.5V5.3A1.5 1.5 0 0 1 7 3.8Z"
        fill={filled ? "#f6c945" : "rgba(255,255,255,.18)"}
        stroke={filled ? "#f6c945" : "#fff"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconShare({ className = "h-8 w-8" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d="M12 15V4.5M8.5 7.5 12 4l3.5 3.5M6.5 11.5v6A1.5 1.5 0 0 0 8 19h8a1.5 1.5 0 0 0 1.5-1.5v-6"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconMusic({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d="M9 18.2a2.6 2.6 0 1 1-2.2-2.55V6.4l11-2.1v8.3"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.2" cy="14.6" r="2.2" stroke="#fff" strokeWidth="1.8" />
    </svg>
  )
}

export function IconVolume({ muted, className = "h-6 w-6" }: IconProps & { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d="M4 10h3.2L12 6.2v11.6L7.2 14H4v-4Z"
        fill="rgba(255,255,255,.2)"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="M16 10.2 20 14.2M20 10.2 16 14.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      ) : (
        <path
          d="M16 9.2a4 4 0 0 1 0 5.6M18.2 7a7 7 0 0 1 0 10"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

export function IconFullscreen({ active, className = "h-6 w-6" }: IconProps & { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d={
          active
            ? "M9 4.5v4.5H4.5M15 4.5v4.5h4.5M9 19.5V15H4.5M15 19.5V15h4.5"
            : "M4.5 9V4.5H9M15 4.5H19.5V9M19.5 15v4.5H15M9 19.5H4.5V15"
        }
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconBack({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d="M14.8 5.5 8.3 12l6.5 6.5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconPlay({ className = "h-8 w-8" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M8 5.8v12.4L19 12 8 5.8Z" fill="#fff" />
    </svg>
  )
}

/** 快退 / 快进：双三角 */
export function IconSeek({
  direction,
  className = "h-6 w-6",
}: IconProps & { direction: "back" | "forward" }) {
  const isBack = direction === "back"
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {isBack ? (
        <>
          <path d="M11.8 6.2 5.2 12l6.6 5.8V6.2Z" fill="#fff" />
          <path d="M18.6 6.2 12 12l6.6 5.8V6.2Z" fill="#fff" />
        </>
      ) : (
        <>
          <path d="M5.4 6.2v11.6L12 12 5.4 6.2Z" fill="#fff" />
          <path d="M12.2 6.2v11.6L18.8 12 12.2 6.2Z" fill="#fff" />
        </>
      )}
    </svg>
  )
}

export function IconPause({ className = "h-8 w-8" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M7.2 5.5h3.2v13H7.2zM13.6 5.5h3.2v13h-3.2z" fill="#fff" />
    </svg>
  )
}

/** loopOne：单条循环；否则表示连播下一条 */
export function IconLoopMode({ loopOne, className = "h-8 w-8" }: IconProps & { loopOne?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      {loopOne ? (
        <>
          <path
            d="M7.2 7.2a6.2 6.2 0 0 1 9.9.4M16.8 16.8a6.2 6.2 0 0 1-9.9-.4"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path d="M17.8 4.8v4.2h-4.2M6.2 19.2v-4.2h4.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="1.5" fill="#25f4ee" />
        </>
      ) : (
        <>
          <path
            d="M5.5 8.5h9.2a3.2 3.2 0 0 1 0 6.4H8"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path d="M8.2 5.8 5.2 8.5l3 2.7M14.5 18.2l3-2.7-3-2.7" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

export function IconUser({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <circle cx="12" cy="8" r="3.2" stroke="#fff" strokeWidth="1.7" />
      <path
        d="M5.5 19.2c1.2-3 3.5-4.4 6.5-4.4s5.3 1.4 6.5 4.4"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconPlus({ className = "h-2.5 w-2.5" }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="M6 1.5v9M1.5 6h9" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function IconCheck({ className = "h-2.5 w-2.5" }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="M2.2 6.2 4.8 8.8 9.8 3.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** 回到列表第一条 */
export function IconToFirst({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path d="M6 5.5h12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M12 19.2V9.2M8.2 12.6 12 8.8l3.8 3.8"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 语言切换 */
export function IconLang({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <circle cx="12" cy="12" r="8.2" stroke="#fff" strokeWidth="1.7" />
      <path d="M3.8 12h16.4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M12 3.8c2.2 2.4 3.4 5.2 3.4 8.2S14.2 17.8 12 20.2C9.8 17.8 8.6 15 8.6 12S9.8 6.2 12 3.8Z"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
