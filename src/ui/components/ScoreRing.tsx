/**
 * Phase 05 のスコアリング(円形ゲージ + 数値)。
 * 元: v3.1.0 の renderResults 内インライン SVG。
 */

interface Props {
  score: number;
}

export function ScoreRing({ score }: Props) {
  const col = score >= 85 ? 'var(--emerald)' : score >= 60 ? 'var(--topaz)' : 'var(--garnet)';
  const circ = 2 * Math.PI * 44;
  const off = circ * (1 - score / 100);
  return (
    <div className="scorering">
      <svg width="104" height="104">
        <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="8" />
        <circle
          cx="52" cy="52" r="44"
          fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={off}
        />
      </svg>
      <div className="val" style={{ color: col }}>{score}</div>
    </div>
  );
}
