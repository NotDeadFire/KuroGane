import React from 'react';

interface KuroganeEmblemProps {
  className?: string;
  size?: number;
  glow?: boolean;
}

export const KuroganeEmblem: React.FC<KuroganeEmblemProps> = ({
  className = '',
  size = 32,
  glow = true,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="kuroBladeGrad" x1="32" y1="4" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0F0F5" />
          <stop offset="35%" stopColor="#8E8E98" />
          <stop offset="100%" stopColor="#1B1B22" />
        </linearGradient>
        <linearGradient id="kuroCrimsonGrad" x1="32" y1="10" x2="32" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF263F" />
          <stop offset="100%" stopColor="#6D0011" />
        </linearGradient>
      </defs>

      {/* Outer Grimoire Seal Ring */}
      <circle
        cx="32"
        cy="32"
        r="27"
        stroke="rgba(201, 201, 209, 0.16)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <polygon
        points="32,7 55,32 32,57 9,32"
        stroke={glow ? 'rgba(164, 0, 25, 0.55)' : 'rgba(201, 201, 209, 0.25)'}
        strokeWidth="1"
        fill="rgba(17, 17, 21, 0.7)"
      />

      {/* Ancient Black Blade Silhouette */}
      <path
        d="M32 6 L36.5 16 L35 42 L29 42 L27.5 16 Z"
        fill="url(#kuroBladeGrad)"
        stroke="#C9C9D1"
        strokeWidth="0.75"
      />
      {/* Central Crimson Rune Channel */}
      <path
        d="M32 11 L32 39"
        stroke="url(#kuroCrimsonGrad)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Swept Winged Crossguard */}
      <path
        d="M17 40 L26 42.5 L32 41 L38 42.5 L47 40 L43 44.5 L32 44 L21 44.5 Z"
        fill="#191920"
        stroke="#C9C9D1"
        strokeWidth="0.9"
      />
      {/* Crimson Core Sigil */}
      <circle cx="32" cy="42.5" r="2.2" fill="#FF263F" />
      {/* Grip & Pommel */}
      <rect x="30.5" y="44" width="3" height="9" rx="1" fill="#2A2A34" />
      <polygon points="32,58 29.5,53.5 34.5,53.5" fill="#C9C9D1" />
    </svg>
  );
};
