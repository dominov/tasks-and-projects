import { useCallback, useState } from 'react'
import type { BannerKind, BannerMessage } from '../components/AppBanner'

export interface UseBannerResult {
  banner: BannerMessage | null
  showBanner: (text: string, kind?: BannerKind) => void
  dismissBanner: (id: string) => void
}

/**
 * Manages a single active banner message.
 * Each call to showBanner replaces the previous message immediately.
 */
export function useBanner(): UseBannerResult {
  const [banner, setBanner] = useState<BannerMessage | null>(null)

  const showBanner = useCallback((text: string, kind: BannerKind = 'info') => {
    setBanner({ id: `${Date.now()}`, kind, text })
  }, [])

  const dismissBanner = useCallback((id: string) => {
    setBanner((current) => (current?.id === id ? null : current))
  }, [])

  return { banner, showBanner, dismissBanner }
}
