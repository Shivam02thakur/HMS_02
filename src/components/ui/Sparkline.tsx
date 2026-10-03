import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SparklineProps {
  values: number[];
  variant?: 'bars' | 'line';
  className?: string;
  /** Tailwind colour class for the stroke/fill, e.g. 'text-primary-500'. */
  colorClassName?: string;
}

/**
 * Minimal trend sparkline. Renders nothing (rather than a misleading flat
 * line) when there isn't enough history yet -- expected for most users
 * until useDailyHistory has collected a few days' data.
 */
export function Sparkline({ values, variant = 'bars', className = '', colorClassName = 'text-primary-500' }: SparklineProps) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [
    (i * w) / (values.length - 1),
    h - 3 - ((v - min) / span) * (h - 8),
  ]);

  if (variant === 'line') {
    const path = points.map((p) => p.join(',')).join(' ');
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`h-7 w-full ${className}`} aria-hidden="true">
        <polyline fill="none" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={path} className={colorClassName} stroke="currentColor" />
      </svg>
    );
  }

  const barWidth = w / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`h-7 w-full ${className}`} aria-hidden="true">
      {values.map((v, i) => {
        const barH = Math.max(2, ((v - min) / span) * (h - 6) + 3);
        const isLast = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * barWidth + barWidth * 0.15}
            y={h - barH}
            width={barWidth * 0.7}
            height={barH}
            rx={1.5}
            className={colorClassName}
            fill="currentColor"
            opacity={isLast ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}

interface TrendPillProps {
  values: number[];
  /** 1 = higher is better (e.g. patients seen), -1 = lower is better
   *  (e.g. pending invoices), 0 = no inherent direction (e.g. department
   *  count) -- controls whether an increase renders as good or bad. */
  higherIsBetter: 1 | -1 | 0;
  className?: string;
}

/** Small "+12% / -4%" pill, coloured by whether the change is favourable
 *  for *this* metric rather than always "up = green". */
export function TrendPill({ values, higherIsBetter, className = '' }: TrendPillProps) {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  const pct = Math.round(((last - first) / Math.abs(first)) * 100);
  const dir = pct > 0 ? 1 : pct < 0 ? -1 : 0;
  const favorable = dir === 0 || higherIsBetter === 0 ? 0 : dir * higherIsBetter;

  const Icon = dir > 0 ? TrendingUp : dir < 0 ? TrendingDown : Minus;
  const tone =
    favorable > 0 ? 'bg-success-bg text-success-fg' :
    favorable < 0 ? 'bg-caution-bg text-caution-fg' :
    'bg-neutral-bg text-neutral-fg';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tone} ${className}`}
      title={`${dir > 0 ? 'Up' : dir < 0 ? 'Down' : 'No change'} ${Math.abs(pct)}% vs ${values.length} days ago`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct)}%
      <span className="sr-only">{dir > 0 ? 'up' : dir < 0 ? 'down' : 'unchanged'} versus {values.length} days ago</span>
    </span>
  );
}
