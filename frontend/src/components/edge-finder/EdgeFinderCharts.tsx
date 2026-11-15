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

export const YieldCurveSvg: React.FC<{
  m3: number;
  y2: number;
  y5: number;
  y10: number;
  y30: number;
  realYield10y: number;
  curveRegime: string;
}> = ({ m3, y2, y5, y10, y30, realYield10y, curveRegime }) => {
  const points = [
    { label: '3M', val: m3 },
    { label: '2Y', val: y2 },
    { label: '5Y', val: y5 },
    { label: '10Y', val: y10 },
    { label: '30Y', val: y30 }
  ];
  const validVals = points.map((p) => p.val).filter((v) => v > 0);
  if (validVals.length < 3) {
    return <div style={{ padding: 24, color: '#9f91c2', fontSize: '0.84rem' }}>Treasury curve yields unavailable.</div>;
  }

  const width = 580;
  const height = 210;
  const padL = 46;
  const padR = 24;
  const padT = 22;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const minY = Math.max(0, Math.min(...validVals, realYield10y > 0 ? realYield10y : validVals[0]) - 0.5);
  const maxY = Math.max(...validVals) + 0.5;
  const spanY = Math.max(maxY - minY, 0.5);

  const xAt = (i: number) => padL + (i / (points.length - 1)) * plotW;
  const yAt = (v: number) => padT + plotH - ((v - minY) / spanY) * plotH;

  const linePath = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(pt.val).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xAt(points.length - 1).toFixed(1)} ${padT + plotH} L ${xAt(0).toFixed(1)} ${padT + plotH} Z`;
  const isInverted = curveRegime.includes('Inverted');
  const strokeColor = isInverted ? '#FF5252' : '#DFC46B';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }} role="img" aria-label={`US Treasury Yield Curve: ${curveRegime}`}>
      <defs>
        <linearGradient id="ef-yc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* Grid */}
      <line x1={padL} y1={padT} x2={width - padR} y2={padT} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" />
      <line x1={padL} y1={padT + plotH / 2} x2={width - padR} y2={padT + plotH / 2} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" />
      <line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="rgba(255,255,255,0.16)" />

      {realYield10y > 0 && (
        <>
          <line
            x1={padL}
            y1={yAt(realYield10y)}
            x2={width - padR}
            y2={yAt(realYield10y)}
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.75"
          />
          <text x={width - padR - 4} y={yAt(realYield10y) - 5} fill="#38bdf8" fontSize="9.5" fontFamily="monospace" textAnchor="end">
            10Y TIPS Real: {realYield10y.toFixed(2)}%
          </text>
        </>
      )}

      <text x={padL - 8} y={padT + 8} fill="#a99bc9" fontSize="10" fontFamily="monospace" textAnchor="end">{maxY.toFixed(1)}%</text>
      <text x={padL - 8} y={padT + plotH} fill="#a99bc9" fontSize="10" fontFamily="monospace" textAnchor="end">{minY.toFixed(1)}%</text>

      <path d={areaPath} fill="url(#ef-yc-fill)" />
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((pt, i) => {
        const cx = xAt(i);
        const cy = yAt(pt.val);
        return (
          <g key={pt.label}>
            <circle cx={cx} cy={cy} r="5" fill="#140926" stroke={strokeColor} strokeWidth="2.5" />
            <text x={cx} y={cy - 10} fill="#ffffff" fontSize="10.5" fontWeight="700" fontFamily="monospace" textAnchor="middle">
              {pt.val.toFixed(2)}%
            </text>
            <text x={cx} y={height - 10} fill="#DFC46B" fontSize="10.5" fontWeight="700" fontFamily="monospace" textAnchor="middle">
              {pt.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const GoldVsDxyChartSvg: React.FC<{
  series: Array<{ date: string; goldPrice: number; dxyPrice: number }>;
}> = ({ series }) => {
  if (!series || series.length < 2) {
    return <div style={{ padding: 24, color: '#9f91c2', fontSize: '0.84rem' }}>Insufficient 30D Gold vs DXY overlay data.</div>;
  }

  const width = 660;
  const height = 220;
  const padL = 52;
  const padR = 58;
  const padT = 18;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const goldVals = series.map((s) => s.goldPrice).filter((v) => v > 0);
  const dxyVals = series.map((s) => s.dxyPrice).filter((v) => v > 0);
  const minG = Math.min(...goldVals);
  const maxG = Math.max(...goldVals);
  const spanG = Math.max(maxG - minG, 1);

  const minD = Math.min(...dxyVals);
  const maxD = Math.max(...dxyVals);
  const spanD = Math.max(maxD - minD, 0.25);

  const xAt = (i: number) => padL + (i / (series.length - 1)) * plotW;
  const yGold = (v: number) => padT + plotH - ((v - minG) / spanG) * plotH;
  const yDxy = (v: number) => padT + plotH - ((v - minD) / spanD) * plotH;

  const goldPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yGold(s.goldPrice).toFixed(1)}`).join(' ');
  const dxyPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yDxy(s.dxyPrice).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }} role="img" aria-label="30-day Gold Futures versus US Dollar Index overlay">
      <line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="rgba(255,255,255,0.16)" />
      {/* Left axis DXY */}
      <text x={padL - 6} y={padT + 8} fill="#38bdf8" fontSize="10" fontFamily="monospace" textAnchor="end">{maxD.toFixed(1)}</text>
      <text x={padL - 6} y={padT + plotH} fill="#38bdf8" fontSize="10" fontFamily="monospace" textAnchor="end">{minD.toFixed(1)}</text>
      {/* Right axis Gold */}
      <text x={width - padR + 6} y={padT + 8} fill="#DFC46B" fontSize="10" fontFamily="monospace">${maxG.toFixed(0)}</text>
      <text x={width - padR + 6} y={padT + plotH} fill="#DFC46B" fontSize="10" fontFamily="monospace">${minG.toFixed(0)}</text>

      <path d={dxyPath} fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.88" />
      <path d={goldPath} fill="none" stroke="#DFC46B" strokeWidth="2.6" />

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

export const CountryHistoryTrendSvg: React.FC<{
  points: Array<{ label: string; value: number }>;
  color: string;
  unit?: string;
  ariaLabel: string;
}> = ({ points, color, unit = '%', ariaLabel }) => {
  if (!points || points.length === 0) {
    return <div style={{ padding: 14, color: '#9f91c2', fontSize: '0.8rem' }}>No historical observations available.</div>;
  }
  const width = 320;
  const height = 128;
  const padL = 36;
  const padR = 14;
  const padT = 18;
  const padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const vals = points.map((p) => p.value);
  const minV = Math.min(0, ...vals);
  const maxV = Math.max(1, ...vals);
  const span = Math.max(maxV - minV, 0.5);
  const zeroY = padT + plotH - ((0 - minV) / span) * plotH;
  const barW = Math.max(10, Math.floor(plotW / points.length) - 6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }} role="img" aria-label={ariaLabel}>
      <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="rgba(255,255,255,0.22)" />
      <text x={padL - 5} y={padT + 6} fill="#a99bc9" fontSize="9" fontFamily="monospace" textAnchor="end">{maxV.toFixed(1)}{unit}</text>
      <text x={padL - 5} y={padT + plotH} fill="#a99bc9" fontSize="9" fontFamily="monospace" textAnchor="end">{minV.toFixed(1)}{unit}</text>
      {points.map((pt, i) => {
        const cx = padL + ((i + 0.5) / points.length) * plotW;
        const valY = padT + plotH - ((pt.value - minV) / span) * plotH;
        const top = Math.min(zeroY, valY);
        const h = Math.max(2, Math.abs(valY - zeroY));
        const showLabel = points.length <= 7 || i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2);
        return (
          <g key={`${pt.label}-${i}`}>
            <rect x={cx - barW / 2} y={top} width={barW} height={h} rx={2} fill={pt.value < 0 ? '#FF5252' : color} opacity="0.88" />
            {showLabel && (
              <text x={cx} y={height - 6} fill="#a99bc9" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                {pt.label.length > 5 ? pt.label.slice(2) : pt.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
