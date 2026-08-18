import React, { useMemo } from 'react';
import './EquityCurve.css';

interface TradeLog {
  strategy_id?: string;
  realized_pl?: number;
  created_at?: string;
  time_exited?: string;
  outcome_type?: string;
}

interface StrategyStat {
  strategyId: string;
  strategyName: string;
}

interface Props {
  tradeLogs: TradeLog[];
  strategies: StrategyStat[];
}

// One colour per strategy — add more if needed
const STRATEGY_COLOURS: Record<string, string> = {
  manna_snd:    '#ffab00',
  sentinel_v2:  '#00e5ff',
  manna_basic:  '#ce93d8',
  combined:     '#00e676',
};
const FALLBACK_COLOURS = ['#ff6b6b', '#69db7c', '#74c0fc', '#ffa94d', '#da77f2'];

function getColour(id: string, index: number): string {
  return STRATEGY_COLOURS[id] ?? FALLBACK_COLOURS[index % FALLBACK_COLOURS.length];
}

export const EquityCurve: React.FC<Props> = ({ tradeLogs, strategies }) => {
  // Build per-strategy equity series from chronological trade logs
  const series = useMemo(() => {
    // Sort all logs by exit time then created_at
    const sorted = [...tradeLogs].sort((a, b) => {
      const ta = new Date(a.time_exited || a.created_at || 0).getTime();
      const tb = new Date(b.time_exited || b.created_at || 0).getTime();
      return ta - tb;
    });

    const strategyIds = strategies.map(s => s.strategyId);

    // Build curves: one for each strategy + one combined
    const curves: Record<string, { r: number; label: string }[]> = {};
    strategyIds.forEach(id => { curves[id] = [{ r: 0, label: 'Start' }]; });
    curves['combined'] = [{ r: 0, label: 'Start' }];

    sorted.forEach(t => {
      const pl = Number(t.realized_pl ?? 0);
      const sid = t.strategy_id ?? '';
      const label = t.time_exited
        ? new Date(t.time_exited).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';

      if (curves[sid]) {
        const prev = curves[sid][curves[sid].length - 1].r;
        curves[sid].push({ r: Math.round((prev + pl) * 100) / 100, label });
      }
      const prevC = curves['combined'][curves['combined'].length - 1].r;
      curves['combined'].push({ r: Math.round((prevC + pl) * 100) / 100, label });
    });

    return curves;
  }, [tradeLogs, strategies]);

  // Determine chart bounds
  const allR = Object.values(series).flatMap(pts => pts.map(p => p.r));
  const minR = Math.min(0, ...allR);
  const maxR = Math.max(0, ...allR);
  const range = maxR - minR || 1;

  const W = 900;
  const H = 280;
  const PAD = { top: 24, right: 24, bottom: 40, left: 56 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Number of Y grid lines
  const gridLines = 5;
  const yStep = range / gridLines;

  const toX = (i: number, total: number) =>
    PAD.left + (total <= 1 ? chartW / 2 : (i / (total - 1)) * chartW);
  const toY = (r: number) =>
    PAD.top + chartH - ((r - minR) / range) * chartH;

  const makePath = (pts: { r: number }[], total: number) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i, total).toFixed(1)},${toY(p.r).toFixed(1)}`).join(' ');

  const makeAreaPath = (pts: { r: number }[], total: number) => {
    const line = makePath(pts, total);
    const lastX = toX(pts.length - 1, total).toFixed(1);
    const zeroY = toY(0).toFixed(1);
    const firstX = toX(0, total).toFixed(1);
    return `${line} L${lastX},${zeroY} L${firstX},${zeroY} Z`;
  };

  // Visible strategy list: only those with > 1 data point
  const visibleStrategies = [
    ...strategies.map((s, i) => ({ id: s.strategyId, name: s.strategyName, colour: getColour(s.strategyId, i) })),
    { id: 'combined', name: 'Combined', colour: getColour('combined', 99) },
  ].filter(s => (series[s.id]?.length ?? 0) > 1);

  const hasTrades = tradeLogs.length > 0;

  return (
    <div className="ec-wrapper">
      <div className="ec-header">
        <div className="ec-title-group">
          <span className="ec-icon">📈</span>
          <div>
            <div className="ec-title">EQUITY CURVE — CUMULATIVE R BY STRATEGY</div>
            <div className="ec-subtitle">
              Each point = one closed trade. Y-axis = total accumulated R from trade 1 onwards.
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="ec-legend">
          {visibleStrategies.map(s => (
            <div key={s.id} className="ec-legend-item">
              <div className="ec-legend-dot" style={{ background: s.colour }} />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      {!hasTrades ? (
        <div className="ec-empty">
          No closed trades yet — equity curve will populate as trades resolve.
        </div>
      ) : (
        <div className="ec-chart-scroll">
          <svg width={W} height={H} className="ec-svg">
            {/* Grid lines */}
            {Array.from({ length: gridLines + 1 }, (_, i) => {
              const rVal = minR + i * yStep;
              const y = toY(rVal);
              return (
                <g key={i}>
                  <line
                    x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                    stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 8} y={y + 4}
                    textAnchor="end" fontSize="10" fill="#666"
                  >
                    {rVal >= 0 ? `+${rVal.toFixed(1)}` : rVal.toFixed(1)}R
                  </text>
                </g>
              );
            })}

            {/* Zero baseline */}
            <line
              x1={PAD.left} y1={toY(0)} x2={W - PAD.right} y2={toY(0)}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 3"
            />

            {/* Area fills first (under lines) */}
            {visibleStrategies.map(s => {
              const pts = series[s.id];
              if (!pts || pts.length < 2) return null;
              return (
                <path
                  key={`area-${s.id}`}
                  d={makeAreaPath(pts, pts.length)}
                  fill={s.colour}
                  opacity={0.07}
                />
              );
            })}

            {/* Strategy lines */}
            {visibleStrategies.map(s => {
              const pts = series[s.id];
              if (!pts || pts.length < 2) return null;
              const lastPt = pts[pts.length - 1];
              const lastX = toX(pts.length - 1, pts.length);
              const lastY = toY(lastPt.r);
              return (
                <g key={`line-${s.id}`}>
                  <path
                    d={makePath(pts, pts.length)}
                    fill="none"
                    stroke={s.colour}
                    strokeWidth={s.id === 'combined' ? 1.5 : 2}
                    strokeOpacity={s.id === 'combined' ? 0.45 : 1}
                    strokeDasharray={s.id === 'combined' ? '5 3' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* End dot + label */}
                  <circle cx={lastX} cy={lastY} r={4} fill={s.colour} />
                  <text
                    x={lastX + 6} y={lastY + 4}
                    fontSize="10" fontWeight="700" fill={s.colour}
                  >
                    {lastPt.r >= 0 ? `+${lastPt.r}R` : `${lastPt.r}R`}
                  </text>
                </g>
              );
            })}

            {/* X-axis date labels — sample every ~10 trades to avoid crowding */}
            {(() => {
              const combinedPts = series['combined'] ?? [];
              const step = Math.max(1, Math.floor(combinedPts.length / 8));
              return combinedPts
                .filter((_, i) => i % step === 0 && i > 0)
                .map((pt, i) => {
                  const idx = (i + 1) * step; // approximate original index
                  const x = toX(Math.min(idx, combinedPts.length - 1), combinedPts.length);
                  return (
                    <text
                      key={i} x={x} y={H - PAD.bottom + 16}
                      textAnchor="middle" fontSize="9" fill="#555"
                    >
                      {pt.label}
                    </text>
                  );
                });
            })()}
          </svg>
        </div>
      )}
    </div>
  );
};
