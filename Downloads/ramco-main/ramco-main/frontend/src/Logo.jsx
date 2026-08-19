export default function Logo({ height = 34, onDark = false, animate = false }) {
  const ink = onDark ? '#FFFFFF' : '#1A1A1A';
  return (
    <svg
      className={`brand-logo${animate ? ' is-animated' : ''}`}
      height={height}
      style={{ height }}
      viewBox="0 0 248 40"
      role="img"
      aria-label="SUPERAMCO"
    >
      <text
        x="0"
        y="30"
        fontFamily="Fredoka, Poppins, system-ui, sans-serif"
        fontWeight="700"
        fontSize="28"
        letterSpacing="-0.045em"
      >
        <tspan className="logo-super" fill={ink}>super</tspan>
        <tspan className="logo-amco" fill="#E31E2B">amco</tspan>
      </text>
      <g className="logo-cart" fill="none" stroke="#E31E2B" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M226 11h6.5l3.2 16.5H243" />
        <path d="M232.4 16.2h12.6" />
        <g className="logo-wheels" fill="#E31E2B" stroke="none">
          <circle className="logo-wheel" cx="233.2" cy="31.6" r="2.1" />
          <circle className="logo-wheel" cx="241.4" cy="31.6" r="2.1" />
        </g>
      </g>
    </svg>
  );
}
