import { useState } from 'react'

/** Unsplash — 카드 커버 폴백(동일 id+slug 는 항상 같은 이미지). */
const Q = 'auto=format&fit=crop&w=1200&q=80'
const FALLBACK_COVER_IMAGES = [
  `https://images.unsplash.com/photo-1497366754035-f200968a6e72?${Q}`,
  `https://images.unsplash.com/photo-1517502884422-41eaead166d4?${Q}`,
  `https://images.unsplash.com/photo-1516280440614-37939bbacd81?${Q}`,
  `https://images.unsplash.com/photo-1504384308090-c894fdcc538d?${Q}`,
  `https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?${Q}`,
  `https://images.unsplash.com/photo-1524758631624-e2822e304c36?${Q}`,
  `https://images.unsplash.com/photo-1522071820081-009f0129c71c?${Q}`,
  `https://images.unsplash.com/photo-1552664730-d307ca884978?${Q}`,
  `https://images.unsplash.com/photo-1573496359152-b982e886ade4?${Q}`,
  `https://images.unsplash.com/photo-1560472354-b33f0f3080e7?${Q}`,
  `https://images.unsplash.com/photo-1497215841840-0fcb49ffe3b4?${Q}`,
  `https://images.unsplash.com/photo-1486312338214-ce68d2e6e44d?${Q}`,
  `https://images.unsplash.com/photo-1556761175-5973dc0f32e7?${Q}`,
  `https://images.unsplash.com/photo-1542744173-8e7e5348f0a0?${Q}`,
  `https://images.unsplash.com/photo-1553877522-43269d4ea984?${Q}`,
  `https://images.unsplash.com/photo-1556761175-b413da4baf72?${Q}`,
  `https://images.unsplash.com/photo-1600880292203-757bb62b4baf?${Q}`,
  `https://images.unsplash.com/photo-1557804506-669a67965ba0?${Q}`,
  `https://images.unsplash.com/photo-1520607162513-77705c0f7d4a?${Q}`,
  `https://images.unsplash.com/photo-1497032623022-80238bd84ef4?${Q}`,
  `https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?${Q}`,
  `https://images.unsplash.com/photo-1531482615713-2afd69097998?${Q}`,
  `https://images.unsplash.com/photo-1542744173-b3cd6377b889?${Q}`,
  `https://images.unsplash.com/photo-1551836022-d5d88e9218df?${Q}`,
  `https://images.unsplash.com/photo-1519389950473-47ba0277781c?${Q}`,
  `https://images.unsplash.com/photo-1521737711867-e3b97375f902?${Q}`,
  `https://images.unsplash.com/photo-1553877522-22f62e291fcd?${Q}`,
  `https://images.unsplash.com/photo-1551434678-e076c223a692?${Q}`,
  `https://images.unsplash.com/photo-1460925895917-afdab827c52f?${Q}`,
  `https://images.unsplash.com/photo-1507679799987-c73779587ccf?${Q}`,
  `https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?${Q}`,
  `https://images.unsplash.com/photo-1553877522-4b250b8b6d73?${Q}`,
  `https://images.unsplash.com/photo-1523240795612-9a054b0db644?${Q}`,
  `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?${Q}`,
  `https://images.unsplash.com/photo-1556761175-4b46a572b786?${Q}`,
  `https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?${Q}`,
  `https://images.unsplash.com/photo-1521737604893-d14cc237f11d?${Q}`,
  `https://images.unsplash.com/photo-1553877522-8afdba0d8e2c?${Q}`,
  `https://images.unsplash.com/photo-1553877522-deb7e3c2b596?${Q}`,
  `https://images.unsplash.com/photo-1526256262350-7da7584cf5eb?${Q}`,
  `https://images.unsplash.com/photo-1551288049-bebda4e38f71?${Q}`,
  `https://images.unsplash.com/photo-1504809862127-08e5c6f5bb0e?${Q}`,
  `https://images.unsplash.com/photo-1510518760481-32903fb45a46?${Q}`,
  `https://images.unsplash.com/photo-1579621970795-87acc0d7f6b9?${Q}`,
  `https://images.unsplash.com/photo-1498050106401-edc0e751a1cf?${Q}`,
  `https://images.unsplash.com/photo-1517694712202-14dd9538aa97?${Q}`,
  `https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?${Q}`,
  `https://images.unsplash.com/photo-1484487820-af0a5bbfd5ba?${Q}`,
  `https://images.unsplash.com/photo-1516320579382-1cf1c801d8da?${Q}`,
  `https://images.unsplash.com/photo-1506126617332-8f29f279c1c8?${Q}`,
] as const

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return h
}

/** 폴백 인덱스용 — 문자열에 대한 분산이 고르게 나오도록 FNV-1a. */
function hashToUint32(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
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
  const key = `${source.id}\0${source.slug}`
  const i = hashToUint32(key) % FALLBACK_COVER_IMAGES.length
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
