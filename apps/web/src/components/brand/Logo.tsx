/**
 * A marca do LUC — quadrado arredondado com mira ciano (sistema de design Mirante).
 * Use `decorative` quando o nome já estiver escrito ao lado, pro leitor de tela
 * não anunciar "Life Under Control" duas vezes.
 */
export function Logo({ size = 30, decorative = false }: { size?: number; decorative?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      role="img"
      aria-label="Life Under Control"
      aria-hidden={decorative || undefined}
    >
      <rect
        x="1"
        y="1"
        width="28"
        height="28"
        rx="9"
        fill="var(--luc-surface-2)"
        stroke="var(--luc-accent-bright)"
        strokeOpacity="0.5"
      />
      <circle cx="15" cy="15" r="7" fill="none" stroke="var(--luc-accent)" strokeWidth="2" />
      <circle cx="15" cy="15" r="2.4" fill="var(--luc-accent)" />
    </svg>
  )
}
