import { useState } from 'react'

const FALLBACK_COVER_IMAGES = [
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80',
] as const

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return h
}

export function coverGradient(seed: string): string {
  const h = hashSeed(seed)
  /** 브랜드 블루 계열(캘린더·카드 폴백) */
  const base = 210 + (h % 72)
  const h1 = base % 360
  const h2 = (h1 + 36) % 360
  return `linear-gradient(135deg, hsl(${h1}, 48%, 38%) 0%, hsl(${h2}, 46%, 24%) 100%)`
}

export type BookingCoverSource = {
  id: string
  slug: string
  cover_image_url?: string | null
}

export function resolveBookingCoverUrl(source: BookingCoverSource): string {
  const u = source.cover_image_url?.trim()
  if (u) return u
  const i = hashSeed(source.id + source.slug) % FALLBACK_COVER_IMAGES.length
  return FALLBACK_COVER_IMAGES[i]
}

export function BookingPageCoverHero({
  seed,
  imageUrl,
}: {
  seed: string
  imageUrl: string
}) {
  const [broken, setBroken] = useState(false)
  const gradient = coverGradient(seed)

  if (broken) {
    return (
      <div
        className="hs-card__hero-bg hs-card__hero-bg--gradient"
        style={{ background: gradient }}
        aria-hidden
      />
    )
  }

  return (
    <img
      className="hs-card__hero-img"
      src={imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  )
}
