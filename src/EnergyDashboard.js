// src/EnergyDashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell
} from 'recharts';

const COST_PER_KWH = 6.14;

// ---- Dark theme (no blue) + gradient page background to match CostPage ----
const theme = (dark) => ({
  // page background
  bg: dark ? '#1E1E1E' : '#fff',
  // card + UI colors
  card: dark ? 'rgba(25,27,32,0.95)' : '#f6f6f6',
  border: dark ? '#2a2d34' : '#e5e7eb',
  text: dark ? '#e5e7eb' : '#111',
  muted: dark ? '#a6adbb' : '#555',
  tabIdle: dark ? '#2b2f36' : '#e5e7eb',
  tabActive: dark ? '#007bff' : '#16a34a',   // green accent
  barFill: '#22c55e',                         // green bars
  lineStroke: '#22c55e',                      // green lines
  peakFill: '#f59e0b',                        // amber for peak marker
  grid: dark ? '#333841' : '#ddd',
});

const COLORS = ['#22c55e', '#84cc16', '#a78bfa', '#f59e0b', '#ef4444'];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

// Recommendation helpers
const VAMPIRE_APPLIANCES = ['TV','Plug Loads','Others','Computer','Game Console','Router','Set‑Top Box'];
const PEAK_HOURS = [17,18,19,20,21,22];
const NIGHT_HOURS = [0,1,2,3,4,5];

function EnergyDashboard({ darkMode = true }) {
  const t = theme(darkMode);

  const [raw, setRaw] = useState([]);
  const [view, setView] = useState('month'); // 'today' | 'month' | 'year'
  const [periodAnchor, setPeriodAnchor] = useState(null);

  // fetch once
  useEffect(() => {
    fetch('https://ce9c70c9028f.ngrok-free.app/api/data', {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    })
      .then(r => r.json())
      .then(json => {
        const cleaned = json.filter(e => e.Timestamp && !String(e.Timestamp).startsWith('1970'));
        setRaw(cleaned);
        const latest = cleaned.reduce((max, e) => {
          const d = new Date(e.Timestamp);
          return !max || d > max ? d : max;
        }, null);
        setPeriodAnchor(latest || new Date());
      })
      .catch(() => setRaw([]));
  }, []);

  // normalize rows
  const rows = useMemo(() => {
    return raw.map(e => {
      const d = new Date(e.Timestamp);
      return {
        dateKey: ymd(d),
        year: d.getFullYear(),
        month: d.getMonth(), // 0..11
        day: d.getDate(),
        hour: d.getHours(),
        kwh: parseFloat(e['Energy Usage (kWh)']) || 0,
        appliance: e.Appliance || 'Unknown'
      };
    });
  }, [raw]);

  // filter to selected period (anchored to latest date in dataset)
  const periodRows = useMemo(() => {
    if (!periodAnchor) return [];
    const a = periodAnchor;
    if (view === 'today') {
      const dayKey = ymd(a);
      return rows.filter(r => r.dateKey === dayKey);
    }
    if (view === 'month') {
      return rows.filter(r => r.year === a.getFullYear() && r.month === a.getMonth());
    }
    return rows.filter(r => r.year === a.getFullYear()); // year
  }, [rows, periodAnchor, view]);

  // --- Change in cost (current vs previous period) ---
  const changeInCost = useMemo(() => {
    if (!periodAnchor) return { current: 0, previous: null, percent: null, labelPrev: '', labelCurr: '' };

    const sumCost = (rs) => rs.reduce((acc, r) => acc + r.kwh * COST_PER_KWH, 0);

    if (view === 'today') {
      const todayKey = ymd(periodAnchor);
      const prevDate = new Date(periodAnchor); prevDate.setDate(prevDate.getDate() - 1);
      const prevKey = ymd(prevDate);
      const current = sumCost(rows.filter(r => r.dateKey === todayKey));
      const previousRows = rows.filter(r => r.dateKey === prevKey);
      const previous = previousRows.length ? sumCost(previousRows) : null;
      const percent = previous ? ((current - previous) / previous) * 100 : null;
      return { current, previous, percent, labelPrev: 'Prev', labelCurr: 'Now' };
    }

    if (view === 'month') {
      const y = periodAnchor.getFullYear(), m = periodAnchor.getMonth();
      const current = sumCost(rows.filter(r => r.year === y && r.month === m));
      const prevM = new Date(y, m - 1, 1);
      const prevRows = rows.filter(r => r.year === prevM.getFullYear() && r.month === prevM.getMonth());
      const previous = prevRows.length ? sumCost(prevRows) : null;
      const percent = previous ? ((current - previous) / previous) * 100 : null;
      return {
        current, previous, percent,
        labelPrev: prevM.toLocaleString('default', { month: 'short' }),
        labelCurr: periodAnchor.toLocaleString('default', { month: 'short' })
      };
    }

    // year
    const y = periodAnchor.getFullYear();
    const current = sumCost(rows.filter(r => r.year === y));
    const prevRows = rows.filter(r => r.year === y - 1);
    const previous = prevRows.length ? sumCost(prevRows) : null;
    const percent = previous ? ((current - previous) / previous) * 100 : null;
    return { current, previous, percent, labelPrev: String(y - 1), labelCurr: String(y) };
  }, [rows, periodAnchor, view]);

  // --- Usage estimate (till now + predicted) ---
  const usageEstimate = useMemo(() => {
    if (!periodAnchor) return { tillNow: 0, predicted: 0, series: [] };

    const groupByDay = new Map(); // YYYY-MM-DD -> kWh
    for (const r of periodRows) {
      groupByDay.set(r.dateKey, (groupByDay.get(r.dateKey) || 0) + r.kwh);
    }
    const sortedDays = [...groupByDay.keys()].sort();
    let cumulative = 0;
    const series = sortedDays.map(dk => {
      cumulative += groupByDay.get(dk);
      return { date: dk, kwh: +cumulative.toFixed(2) };
    });

    // extrapolate for ongoing period only
    let tillNow = cumulative;
    let predicted = tillNow;

    if (view === 'today') {
      const hourNow = periodRows.length ? Math.max(...periodRows.map(r => r.hour)) : 0;
      const hoursElapsed = Math.max(1, hourNow + 1);
      const dailyTotalSoFar = periodRows.reduce((a, r) => a + r.kwh, 0);
      const avgPerHour = dailyTotalSoFar / hoursElapsed;
      predicted = avgPerHour * 24;
    } else if (view === 'month') {
      const y = periodAnchor.getFullYear(); const m = periodAnchor.getMonth();
      const dim = daysInMonth(y, m);
      const daysElapsed = Math.min(new Date(periodAnchor).getDate(), dim);
      const avgPerDay = tillNow / Math.max(1, daysElapsed);
      predicted = avgPerDay * dim;
    } else {
      const y = periodAnchor.getFullYear();
      const dayOfYear = Math.floor((periodAnchor - new Date(y, 0, 1)) / (24*3600*1000)) + 1;
      const daysInYear = (new Date(y,1,29).getMonth() === 1) ? 366 : 365;
      const avgPerDay = tillNow / Math.max(1, dayOfYear);
      predicted = avgPerDay * daysInYear;
    }

    return { tillNow: +tillNow.toFixed(2), predicted: +predicted.toFixed(2), series };
  }, [periodRows, periodAnchor, view]);

  // --- Active Appliances (top 5) ---
  const activeAppliances = useMemo(() => {
    const byAp = new Map();
    for (const r of periodRows) {
      byAp.set(r.appliance, (byAp.get(r.appliance) || 0) + r.kwh);
    }
    return [...byAp.entries()]
      .map(([name, kwh]) => ({ name, kWh: +kwh.toFixed(2) }))
      .sort((a, b) => b.kWh - a.kWh)
      .slice(0, 5);
  }, [periodRows]);

  // --- Peak hour ---
  const peakHour = useMemo(() => {
    const byHour = new Array(24).fill(0);
    for (const r of periodRows) byHour[r.hour] += r.kwh;
    const idx = byHour.reduce((imax, v, i) => v > byHour[imax] ? i : imax, 0);
    return { hour: idx, kwh: +byHour[idx].toFixed(2) };
  }, [periodRows]);

  // --- Recommendations (rich, data-driven) ---
  const recommendations = useMemo(() => {
    if (!periodAnchor || periodRows.length === 0) {
      return ['Not enough data for this period yet. Keep using the system — we’ll generate insights automatically.'];
    }

    const recs = [];

    // Totals
    const totalKWh = periodRows.reduce((a, r) => a + r.kwh, 0);

    // By appliance totals
    const byAp = new Map();
    for (const r of periodRows) byAp.set(r.appliance, (byAp.get(r.appliance) || 0) + r.kwh);
    const sortedAp = [...byAp.entries()].sort((a,b)=>b[1]-a[1]);

    // Top contributors
    const top3 = sortedAp.slice(0,3);
    if (top3.length) {
      const msg = top3.map(([name, k]) => `${name} ${((k/Math.max(1,totalKWh))*100).toFixed(0)}%`).join(', ');
      recs.push(`Top contributors this period: ${msg}. Focus on these to make the biggest impact.`);
    }

    // Hourly profile
    const hourly = new Array(24).fill(0);
    for (const r of periodRows) hourly[r.hour] += r.kwh;

    // 1) HVAC dominance -> thermostat nudge
    const acKwh = (byAp.get('Air Conditioner') || 0) + (byAp.get('Heater') || 0);
    if (totalKWh > 0 && acKwh / totalKWh > 0.30) {
      const estSaveMur = (acKwh * 0.07) * COST_PER_KWH; // ~7% saving for 1–2°C change
      recs.push(`HVAC is a major driver (~${((acKwh/totalKWh)*100).toFixed(0)}%). Raise cooling or lower heating setpoint by 1–2 °C and use schedules. Potential saving ≈ MUR ${estSaveMur.toFixed(0)} this period.`);
    }

    // 2) Washer/Dishwasher at peak -> shift to midday
    const shareAtHours = (name, hours) => {
      const kAll = periodRows.filter(r => r.appliance === name).reduce((s,r)=>s+r.kwh,0);
      if (kAll === 0) return 0;
      const kPeak = periodRows.filter(r => r.appliance === name && hours.includes(r.hour)).reduce((s,r)=>s+r.kwh,0);
      return kPeak / kAll;
    };
    const washPeakShare = Math.max(
      shareAtHours('Washing Machine', PEAK_HOURS),
      shareAtHours('Dishwasher', PEAK_HOURS)
    );
    if (washPeakShare > 0.4) {
      const kWhShiftable = washPeakShare * ((byAp.get('Washing Machine') || 0) + (byAp.get('Dishwasher') || 0));
      const estSaveMur = kWhShiftable * COST_PER_KWH * 0.10; // assume ~10% advantage off-peak/efficient cycles
      recs.push(`Laundry/Dishwashing often runs in evening peaks. Shift cycles to late morning/early afternoon. Estimated saving ≈ MUR ${estSaveMur.toFixed(0)}.`);
    }

    // 3) Vampire/standby loads at night
    const nightKwh = periodRows.filter(r => NIGHT_HOURS.includes(r.hour)).reduce((s,r)=>s+r.kwh,0);
    const vampireKwh = periodRows
      .filter(r => NIGHT_HOURS.includes(r.hour) && VAMPIRE_APPLIANCES.includes(r.appliance))
      .reduce((s,r)=>s+r.kwh,0);
    if (nightKwh > 0 && vampireKwh / nightKwh > 0.20 && vampireKwh > 0.2) {
      const estSaveMur = vampireKwh * COST_PER_KWH * 0.15; // 15% reduction via smart strips/auto-off
      recs.push(`Overnight standby seems high (≈${((vampireKwh/Math.max(1,totalKWh))*100).toFixed(0)}% of total). Use smart power strips and disable “always‑on” devices at night. Potential saving ≈ MUR ${estSaveMur.toFixed(0)}.`);
    }

    // 4) High overnight base load vs daytime
    const avg = (arr) => arr.reduce((a,b)=>a+b,0) / Math.max(1,arr.length);
    const nightAvg = avg(NIGHT_HOURS.map(h => hourly[h]));
    const midDayHours = [10,11,12,13,14,15];
    const dayAvg = avg(midDayHours.map(h => hourly[h]));
    if (nightAvg > dayAvg * 0.6 && nightAvg > 0.1) {
      recs.push(`Overnight base load is relatively high. Audit “always‑on” devices (old fridge, routers, set‑top box). Target a 10–20% reduction overnight.`);
    }

    // 5) Spike vs previous period
    // reuse changeInCost to avoid recomputation
    if (changeInCost.previous != null && changeInCost.current > changeInCost.previous * 1.08) {
      const pct = ((changeInCost.current - changeInCost.previous)/Math.max(1,changeInCost.previous))*100;
      recs.push(`Energy cost up by ${pct.toFixed(1)}% vs previous ${view}. Review recent schedule/setpoint changes or new devices added.`);
    }

    // 6) Weekend vs weekday skew
    const weekday = [1,2,3,4,5], weekend = [0,6];
    const sumByDoW = (dows) => periodRows
      .filter(r => dows.includes(new Date(r.dateKey).getDay()))
      .reduce((s,r)=>s+r.kwh,0);
    const wkK = sumByDoW(weekday), weK = sumByDoW(weekend);
    if (wkK > 0 && weK > 0 && (weK/wkK > 1.4 || wkK/weK > 1.4)) {
      const skew = weK > wkK ? 'weekends' : 'weekdays';
      recs.push(`Usage is concentrated on ${skew}. If tariffs vary, schedule flexible loads to cheaper days/hours.`);
    }

    const unique = Array.from(new Set(recs)).filter(Boolean);
    return unique.slice(0,5);
  }, [periodRows, periodAnchor, view, changeInCost]);

  // styles
  const card = {
    backgroundColor: t.card,
    borderRadius: 10,
    padding: 16,
    boxShadow: `0 0 0 1px ${t.border} inset`,
    minHeight: 200
  };
  const textMuted = { color: t.muted };
  const money = (mur) => `MUR ${mur.toFixed(2)}`;

  return (
    <div style={{ padding: 24, background: t.bg, minHeight: '100vh', color: t.text }}>
      {/* Tabs */}
      <div style={{ display:'flex', gap:12, marginBottom: 16 }}>
        {['today','month','year'].map((key) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              padding:'8px 14px',
              border:'none',
              borderRadius:6,
              background: view===key ? t.tabActive : t.tabIdle,
              color:'#fff',
              cursor:'pointer'
            }}
          >
            {key[0].toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(260px,1fr))', gap:16 }}>
        
        {/* Change in cost */}
        <div style={card}>
          <div style={{ marginBottom:8, ...textMuted }}>CHANGE IN COST</div>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <div style={{ flex:1 }}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={[
                  { label: changeInCost.labelPrev || 'Prev', cost: changeInCost.previous || 0 },
                  { label: changeInCost.labelCurr || 'Now',  cost: changeInCost.current  || 0 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
                  <XAxis dataKey="label" stroke={t.text} />
                  <YAxis stroke={t.text} />
                  <Tooltip formatter={(v)=>money(v)} />
                  <Bar dataKey="cost" fill={t.barFill} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ minWidth:120 }}>
              <div style={{ fontSize:26, fontWeight:700 }}>{money(changeInCost.current || 0)}</div>
              <div style={textMuted}>Current</div>
              {changeInCost.percent != null && (
                <div style={{ marginTop:8, color: changeInCost.percent >= 0 ? '#ef4444' : '#22c55e' }}>
                  {changeInCost.percent >= 0 ? '▲' : '▼'} {Math.abs(changeInCost.percent).toFixed(2)}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Usage estimate */}
        <div style={card}>
          <div style={{ marginBottom:8, ...textMuted }}>USAGE ESTIMATE</div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <div>Till Now: <strong>{usageEstimate.tillNow.toFixed(2)} kWh</strong></div>
            <div>Predicted: <strong>{usageEstimate.predicted.toFixed(2)} kWh</strong></div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={usageEstimate.series}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
              <XAxis dataKey="date" stroke={t.text} />
              <YAxis stroke={t.text} />
              <Tooltip />
              <Line type="monotone" dataKey="kwh" stroke={t.lineStroke} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Peak time/hour */}
        <div style={card}>
          <div style={{ marginBottom:8, ...textMuted }}>PEAK TIME / HOUR</div>
          <div style={{ fontSize:36, fontWeight:700, marginBottom:8 }}>
            {pad(peakHour.hour)}:00
          </div>
          <div style={textMuted}>{peakHour.kwh} kWh at peak</div>
          <div style={{ height:120, marginTop:8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...Array(24)].map((_, i) => ({ hour: i, val: 1 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
                <XAxis dataKey="hour" stroke={t.text} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="val" isAnimationActive={false}
                  shape={(props) => {
                    const { x, y, width, height, index } = props;
                    const isPeak = index === peakHour.hour;
                    return (
                      <rect
                        x={x} y={y} width={width} height={height}
                        fill={isPeak ? t.peakFill : t.border}
                        rx={2} ry={2}
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active appliances */}
        <div style={card}>
          <div style={{ marginBottom:8, ...textMuted }}>ACTIVE APPLIANCES</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={activeAppliances} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
              <XAxis type="number" stroke={t.text} />
              <YAxis type="category" dataKey="name" stroke={t.text} />
              <Tooltip formatter={(v, n) => n === 'kWh' ? `${v} kWh` : v} />
              <Bar dataKey="kWh">
                {activeAppliances.map((a, i) => (
                  <Cell key={a.name} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recommendations */}
        <div style={{ ...card, gridColumn: 'span 2' }}>
          <div style={{ marginBottom:8, ...textMuted }}>RECOMMENDATIONS</div>
          <ul style={{ margin:0, paddingLeft: 18 }}>
            {recommendations.map((r,i)=>(
              <li key={i} style={{ marginBottom:6 }}>{r}</li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
}

export default EnergyDashboard;
