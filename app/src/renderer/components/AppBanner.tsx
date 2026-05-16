export type BannerKind = 'info' | 'warning' | 'error'

export interface BannerMessage {
  id: string
  kind: BannerKind
  text: string
}

interface AppBannerProps {
  message: BannerMessage | null
  onDismiss: (id: string) => void
}

/**
 * Thin single-line application header banner.
 * Displays one message at a time: info (blue), warning (amber), error (red).
 * Dismissed by clicking the × button or automatically replaced by a new message.
 */
function AppBanner({ message, onDismiss }: AppBannerProps) {
  if (!message) {
    return null
  }

  return (
    <div className={`app-banner app-banner--${message.kind}`} role="alert" aria-live="assertive">
      <span className="app-banner__text">{message.text}</span>
      <button
        type="button"
        className="app-banner__dismiss"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(message.id)}
      >
        ×
      </button>
    </div>
  )
}

export default AppBanner
