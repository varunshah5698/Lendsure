/**
 * LendSure mark — a shield (trust & protection) fused with a check that
 * breaks upward into an arrow (confident, evidence-backed decisions).
 */
export default function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="LendSure logo"
      style={{ flexShrink: 0, filter: "drop-shadow(0 3px 10px rgba(99,102,241,.45))" }}>
      <defs>
        <linearGradient id="ls-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#ls-logo-g)" />
      <rect x="2" y="2" width="60" height="60" rx="17" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
      <path d="M32 9 L49 16 V31.5 C49 42.5 41.5 50 32 55 C22.5 50 15 42.5 15 31.5 V16 Z"
        fill="rgba(255,255,255,.13)" stroke="#fff" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M23.5 32.5 l6.5 6.5 L43 25" fill="none" stroke="#fff"
        strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M35.5 25 H43 V32.5" fill="none" stroke="#fff"
        strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
