// Reuses the exact destination-marker diamond shape from RouteMap.jsx and
// the origin-dot/route-line motif from FlightStrip, scaled into a badge —
// so the "logo" is drawn from the app's own established visual language
// (a route being flown) rather than an unrelated new glyph.
export default function Logo({ size = 40, wordmark = false, className = '' }) {
  return (
    <span className={`logo ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <svg width={size} height={size} viewBox="0 0 40 40" className="logo__mark" aria-hidden="true">
        <defs>
          <linearGradient id="logoMarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--green)" />
            <stop offset="100%" stopColor="#00A874" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#logoMarkGrad)" />
        <circle cx="11" cy="28" r="2.6" fill="#06110C" />
        <path
          d="M 11 28 Q 18 26 25 13"
          stroke="#06110C"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="0.5 5"
          fill="none"
        />
        <path d="M 25 8 L 29 16.6 L 25 14.8 L 21 16.6 Z" fill="#06110C" />
      </svg>
      {wordmark && (
        <span className="logo__wordmark">
          <span className="logo__wordmark-flight">Flight</span>
          <span className="logo__wordmark-sync">Sync</span>
        </span>
      )}
    </span>
  );
}
