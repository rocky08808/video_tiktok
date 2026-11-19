"use client"

import { useMemo, useState } from "react"
import { useT } from "@/components/LocaleProvider"

export type Comment = {
  id: string
  user: string
  text: string
  likes: number
}

const LINES_ZH = [
  ["循环看了三遍", "清晰度可以", "求这首 BGM"],
  ["转场好自然", "已关注", "声音再大一点"],
  ["夜景绝了", "这是哪座城市", "想学这个运镜"],
  ["笑死", "再来一条", "收藏了"],
]

const LINES_EN = [
  ["Watched this three times", "Looks sharp", "What's the BGM?"],
  ["Smooth cuts", "Followed", "Turn the volume up"],
  ["Night shots fire", "Which city is this?", "Want that camera move"],
  ["lol", "More please", "Saved"],
]

export function seedComments(videoId: string, locale: "zh" | "en" = "zh"): Comment[] {
  const lines = locale === "en" ? LINES_EN : LINES_ZH
  const bucket = lines[Math.abs(hash(videoId)) % lines.length] ?? lines[0]
  const users = locale === "en" ? ["Ann", "Night", "Lin", "momo"] : ["阿宁", "夜航", "小林", "momo"]
  return bucket.map((text, index) => ({
    id: `${videoId}-${index}`,
    user: users[index % users.length] ?? (locale === "en" ? "User" : "用户"),
    text,
    likes: 20 + ((hash(videoId) + index * 17) % 180),
  }))
}

export function CommentSheet({
  open,
  author,
  comments,
  onClose,
  onSubmit,
}: {
  open: boolean
  author: string
  comments: Comment[]
  onClose: () => void
  onSubmit: (text: string) => void
}) {
  const t = useT()
  const [text, setText] = useState("")
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const title = useMemo(() => t("comment.count", { n: comments.length }), [comments.length, t])

  return (
    <div inert={!open} className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label={t("comment.close")}
        className={`absolute inset-0 bg-black/45 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <section
        className={`absolute inset-x-0 bottom-0 flex h-[72%] flex-col rounded-t-2xl bg-[#141414] text-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!open}
      >
        <header className="relative grid place-items-center px-4 py-3">
          <span className="absolute top-2 h-1 w-10 rounded-full bg-white/20" />
          <h2 className="pt-2 text-sm font-medium text-white/90">{title}</h2>
          <button
            type="button"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center text-white/70"
            onClick={onClose}
            aria-label={t("comment.closeBtn")}
          >
            ×
          </button>
        </header>
        <ul className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-3">
          {comments.map((comment) => {
            const active = liked[comment.id]
            return (
              <li key={comment.id} className="flex gap-3">
                <Avatar name={comment.user} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-white/45">{comment.user}</p>
                  <p className="mt-0.5 text-[15px] leading-snug">{comment.text}</p>
                </div>
                <button
                  type="button"
                  className="flex flex-col items-center gap-1 text-[11px] text-white/55"
                  onClick={() => setLiked((current) => ({ ...current, [comment.id]: !current[comment.id] }))}
                  aria-label={t("comment.like")}
                >
                  <span className={active ? "text-[var(--dy)]" : ""}>♥</span>
                  {comment.likes + (active ? 1 : 0)}
                </button>
              </li>
            )
          })}
          <li className="pb-2 text-center text-xs text-white/35">{t("comment.from", { author })}</li>
        </ul>
        <form
          className="flex items-center gap-2 border-t border-white/10 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault()
            const next = text.trim()
            if (!next) return
            onSubmit(next)
            setText("")
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("comment.placeholder")}
            maxLength={120}
            className="h-10 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-sm outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="px-2 text-sm font-semibold text-[var(--dy)] disabled:opacity-40"
          >
            {t("comment.send")}
          </button>
        </form>
      </section>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-black"
      style={{ background: colorOf(name) }}
    >
      {Array.from(name)[0]}
    </span>
  )
}

function hash(value: string) {
  let n = 0
  for (const char of value) n = (n * 31 + char.charCodeAt(0)) >>> 0
  return n
}

export function colorOf(name: string) {
  const palette = ["#fe2c55", "#25f4ee", "#8b7cff", "#ffb020", "#3dd68c", "#4c8dff"]
  return palette[hash(name) % palette.length]
}
