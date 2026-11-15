import React from 'react';
import type { HistoricalScorePoint } from '../../hooks/useEdgeFinder';

export const ScoreGaugeSvg: React.FC<{ score: number; biasLabel: string }> = ({ score, biasLabel }) => {
  const clamped = Math.max(-10, Math.min(10, score));
  // Map -10..+10 to -90..+90 degrees
  const angleDeg = (clamped / 10) * 90;
  const cx = 130;
  const cy = 115;
  const radius = 84;
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const needleX = cx + (radius - 12) * Math.cos(rad);
  const needleY = cy + (radius - 12) * Math.sin(rad);

  const strokeColor =
    clamped >= 5 ? '#00E676' :
    clamped >= 2 ? '#69F0AE' :
    clamped <= -5 ? '#FF5252' :
    clamped <= -2 ? '#FF8A80' : '#FFC107';

  return (
    <svg viewBox="0 0 260 150" width="100%" style={{ maxWidth: 280, display: 'block', margin: '0 auto' }} role="img" aria-label={`Edge Score ${clamped} out of 10: ${biasLabel}`}>
      <defs>
        <linearGradient id="ef-gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF5252" />
          <stop offset="35%" stopColor="#FF9100" />
          <stop offset="50%" stopColor="#FFC107" />
          <stop offset="68%" stopColor="#AEEA00" />
          <stop offset="100%" stopColor="#00E676" />
        </linearGradient>
      </defs>
      {/* Track arc */}
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="16"
        strokeLinecap="round"
      />
      {/* Spectrum arc */}
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke="url(#ef-gauge-grad)"
        strokeWidth="11"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* Scale ticks */}
      <text x="26" y="132" fill="#ff8a80" fontSize="10" fontFamily="monospace">-10</text>
      <text x="126" y="20" fill="#ffe082" fontSize="10" fontFamily="monospace" textAnchor="middle">0</text>
      <text x="234" y="132" fill="#69f0ae" fontSize="10" fontFamily="monospace" textAnchor="end">+10</text>
      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={needleX}
        y2={needleY}
        stroke={strokeColor}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="6.5" fill="#DFC46B" stroke="#140926" strokeWidth="2" />
      <text x={cx} y="96" fill="#ffffff" fontSize="26" fontWeight="700" fontFamily="monospace" textAnchor="middle">
        {clamped >= 0 ? `+${clamped.toFixed(1)}` : clamped.toFixed(1)}
      </text>
      <text x={cx} y="142" fill={strokeColor} fontSize="12" fontWeight="700" letterSpacing="1" textAnchor="middle">
        {biasLabel.toUpperCase()}
      </text>
    </svg>
  );
};

export const HistoricalScorePriceSvg: React.FC<{
  series: HistoricalScorePoint[];
  instrument: string;
}> = ({ series, instrument }) => {
  if (!series || series.length < 2) {
    return <div style={{ padding: 24, color: '#9f91c2', fontSize: '0.84rem' }}>Insufficient history for {instrument}.</div>;
  }

  const width = 680;
  const height = 220;
  const padL = 44;
  const padR = 54;
  const padT = 18;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const prices = series.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const spanP = Math.max(maxP - minP, minP * 0.002 || 0.0001);

  const xAt = (i: number) => padL + (i / (series.length - 1)) * plotW;
  const yPrice = (p: number) => padT + plotH - ((p - minP) / spanP) * plotH;
  const yScore = (s: number) => padT + plotH - ((s + 10) / 20) * plotH;

  const pricePath = series
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yPrice(pt.price).toFixed(1)}`)
    .join(' ');
  const scorePath = series
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yScore(pt.score).toFixed(1)}`)
    .join(' ');

  const zeroY = yScore(0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }} role="img" aria-label={`30-day Price vs EdgeScore chart for ${instrument}`}>
      {/* Horizontal Score Zero Line */}
      <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="rgba(255,255,255,0.14)" strokeDasharray="4 4" />
      <text x={padL - 8} y={padT + 8} fill="#7dd3fc" fontSize="10" fontFamily="monospace" textAnchor="end">+10</text>
      <text x={padL - 8} y={zeroY + 3} fill="#a99bc9" fontSize="10" fontFamily="monospace" textAnchor="end">0</text>
      <text x={padL - 8} y={padT + plotH} fill="#ff8a80" fontSize="10" fontFamily="monospace" textAnchor="end">-10</text>

      {/* Right axis Price labels */}
      <text x={width - padR + 8} y={padT + 8} fill="#DFC46B" fontSize="10" fontFamily="monospace">{maxP.toPrecision(5)}</text>
      <text x={width - padR + 8} y={padT + plotH} fill="#DFC46B" fontSize="10" fontFamily="monospace">{minP.toPrecision(5)}</text>

      {/* Edge Score Line */}
      <path d={scorePath} fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.9" />

      {/* Asset Price Line */}
      <path d={pricePath} fill="none" stroke="#DFC46B" strokeWidth="2.5" />

      {/* X axis dates */}
      <text x={padL} y={height - 6} fill="#9f91c2" fontSize="10" fontFamily="monospace">{series[0].date}</text>
      <text x={padL + plotW / 2} y={height - 6} fill="#9f91c2" fontSize="10" fontFamily="monospace" textAnchor="middle">
        {series[Math.floor(series.length / 2)].date}
      </text>
      <text x={width - padR} y={height - 6} fill="#9f91c2" fontSize="10" fontFamily="monospace" textAnchor="end">
        {series[series.length - 1].date}
      </text>
    </svg>
  );
};

export const CotHistoryChartSvg: React.FC<{
  history: Array<{ date: string; net: number; longPct: number }>;
  instrument: string;
}> = ({ history, instrument }) => {
  if (!history || history.length < 2) return null;
  const width = 680;
  const height = 190;
  const padL = 62;
  const padR = 20;
  const padT = 16;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const nets = history.map((h) => h.net);
  const minNet = Math.min(0, ...nets);
  const maxNet = Math.max(0, ...nets);
  const span = Math.max(maxNet - minNet, 1);

  const zeroY = padT + plotH - ((0 - minNet) / span) * plotH;
  const barW = Math.max(12, Math.floor(plotW / history.length) - 8);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }} role="img" aria-label={`12-week COT Net Non-Commercial positioning for ${instrument}`}>
      <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="rgba(255,255,255,0.28)" />
      <text x={padL - 8} y={padT + 8} fill="#b7a8d6" fontSize="10" fontFamily="monospace" textAnchor="end">
        {Math.round(maxNet / 1000)}k
      </text>
      <text x={padL - 8} y={zeroY + 3} fill="#b7a8d6" fontSize="10" fontFamily="monospace" textAnchor="end">0</text>
      <text x={padL - 8} y={padT + plotH} fill="#b7a8d6" fontSize="10" fontFamily="monospace" textAnchor="end">
        {Math.round(minNet / 1000)}k
      </text>

      {history.map((pt, i) => {
        const cx = padL + ((i + 0.5) / history.length) * plotW;
        const valY = padT + plotH - ((pt.net - minNet) / span) * plotH;
        const barTop = Math.min(zeroY, valY);
        const barH = Math.max(2, Math.abs(valY - zeroY));
        const isPos = pt.net >= 0;
        return (
          <g key={pt.date + i}>
            <rect
              x={cx - barW / 2}
              y={barTop}
              width={barW}
              height={barH}
              rx={3}
              fill={isPos ? '#00E676' : '#FF5252'}
              opacity="0.85"
            />
            {i % 2 === 0 && (
              <text x={cx} y={height - 6} fill="#9f91c2" fontSize="9.5" fontFamily="monospace" textAnchor="middle">
                {pt.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SeasonalityBarChartSvg: React.FC<{
  monthlyReturns: number[];
  currentMonthIndex: number;
  instrument: string;
}> = ({ monthlyReturns, currentMonthIndex, instrument }) => {
  const width = 680;
  const height = 190;
  const padL = 42;
  const padR = 16;
  const padT = 18;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxAbs = Math.max(2, ...monthlyReturns.map((v) => Math.abs(v)));
  const zeroY = padT + plotH / 2;
  const barW = Math.max(16, Math.floor(plotW / 12) - 10);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }} role="img" aria-label={`10-year monthly seasonality returns for ${instrument}`}>
      <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="rgba(255,255,255,0.28)" />
      <text x={padL - 6} y={padT + 8} fill="#69f0ae" fontSize="10" fontFamily="monospace" textAnchor="end">+{maxAbs.toFixed(1)}%</text>
      <text x={padL - 6} y={zeroY + 3} fill="#b7a8d6" fontSize="10" fontFamily="monospace" textAnchor="end">0%</text>
      <text x={padL - 6} y={padT + plotH} fill="#ff8a80" fontSize="10" fontFamily="monospace" textAnchor="end">-{maxAbs.toFixed(1)}%</text>

      {monthlyReturns.map((ret, i) => {
        const cx = padL + ((i + 0.5) / 12) * plotW;
        const barH = Math.max(2, (Math.abs(ret) / maxAbs) * (plotH / 2));
        const barTop = ret >= 0 ? zeroY - barH : zeroY;
        const isCurrent = i === currentMonthIndex;
        return (
          <g key={MONTHS[i]}>
            <rect
              x={cx - barW / 2}
              y={barTop}
              width={barW}
              height={barH}
              rx={3}
              fill={ret >= 0 ? '#00E676' : '#FF5252'}
              stroke={isCurrent ? '#DFC46B' : 'none'}
              strokeWidth={isCurrent ? 2 : 0}
              opacity={isCurrent ? 1 : 0.78}
            />
            <text
              x={cx}
              y={height - 6}
              fill={isCurrent ? '#DFC46B' : '#a99bc9'}
              fontWeight={isCurrent ? '700' : '400'}
              fontSize="10"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {MONTHS[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
