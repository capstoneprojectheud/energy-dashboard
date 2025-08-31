import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import Select from 'react-select';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const mondayOfWeek = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};

const COLORS = ['#00bfff','#82ca9d','#ffc658','#ff7f50','#8a2be2','#ff69b4','#00c49f','#d0ed57','#a4de6c'];

const CostPage = ({ darkMode }) => {
  const [costPerKWh, setCostPerKWh] = useState(6.14);
  const [viewMode, setViewMode] = useState('monthly');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState('');
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [selectedAppliances, setSelectedAppliances] = useState([]);
  const [raw, setRaw] = useState([]);

  useEffect(() => {
    fetch('https://ce9c70c9028f.ngrok-free.app/api/data', {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    })
      .then(r => r.json())
      .then(json => {
        const cleaned = json.filter(e => e.Timestamp && !String(e.Timestamp).startsWith('1970'));
        setRaw(cleaned);
      })
      .catch(() => setRaw([]));
  }, []);

  const allAppliances = useMemo(() => {
    const s = new Set(raw.map(e => e.Appliance).filter(Boolean));
    return [...s].sort();
  }, [raw]);

  useEffect(() => {
    if (allAppliances.length && selectedAppliances.length === 0 && !filterEnabled) {
      setSelectedAppliances(allAppliances);
    }
  }, [allAppliances, filterEnabled, selectedAppliances.length]);

  const applianceOptions = useMemo(
    () => allAppliances.map(a => ({ value: a, label: a })),
    [allAppliances]
  );

  const activeAppliances = useMemo(() => {
    if (!filterEnabled) return allAppliances;
    return selectedAppliances.length ? selectedAppliances : allAppliances;
  }, [filterEnabled, selectedAppliances, allAppliances]);

  const byDayAppliance = useMemo(() => {
    const m = new Map();
    for (const e of raw) {
      if (!e.Appliance) continue;
      const d = new Date(e.Timestamp);
      const key = ymd(d);
      if (!m.has(key)) m.set(key, new Map());
      const inner = m.get(key);
      const kwh = parseFloat(e['Energy Usage (kWh)']) || 0;
      inner.set(e.Appliance, (inner.get(e.Appliance) || 0) + kwh);
    }
    return m;
  }, [raw]);

  const months = useMemo(() => {
    const set = new Set();
    for (const key of byDayAppliance.keys()) {
      const [Y,M] = key.split('-');
      set.add(`${Y}-${M}`);
    }
    return [...set].sort();
  }, [byDayAppliance]);

  const weeks = useMemo(() => {
    const map = new Map();
    for (const key of byDayAppliance.keys()) {
      const d = new Date(`${key}T00:00:00`);
      const mon = mondayOfWeek(d);
      const monKey = ymd(mon);
      if (!map.has(monKey)) {
        const end = new Date(mon);
        end.setDate(mon.getDate() + 6);
        map.set(monKey, { start: new Date(mon), end });
      }
    }
    return [...map.entries()]
      .map(([monKey, {start,end}]) => ({ key: `${monKey}__WEEK`, start, end }))
      .sort((a, b) => a.start - b.start);
  }, [byDayAppliance]);

  useEffect(() => {
    if (viewMode === 'monthly' && months.length) {
      setSelectedPeriodKey(prev => (prev && !prev.includes('__WEEK')) ? prev : months[months.length - 1]);
    } else if (viewMode === 'weekly' && weeks.length) {
      const last = weeks[weeks.length - 1].key;
      setSelectedPeriodKey(prev => (prev && prev.includes('__WEEK')) ? prev : last);
    } else if (viewMode === 'today') {
      setSelectedPeriodKey(ymd(new Date()));
    } else {
      setSelectedPeriodKey('');
    }
  }, [viewMode, months, weeks]);

  const { chartData, total, soFar, savings, periodTitle } = useMemo(() => {
    if (!selectedPeriodKey || byDayAppliance.size === 0 || activeAppliances.length === 0) {
      return { chartData: [], total: 0, soFar: 0, savings: null, periodTitle: '' };
    }

    const today = new Date();
    const todayKey = ymd(today);

    const buildRow = (dayKey) => {
      const map = byDayAppliance.get(dayKey) || new Map();
      const row = { date: dayKey };
      let sum = 0;
      for (const ap of activeAppliances) {
        const kwh = map.get(ap) || 0;
        const cost = +(kwh * costPerKWh).toFixed(2);
        row[ap] = cost;
        sum += cost;
      }
      return { row, sum };
    };

    const sumAcross = (rows) =>
      rows.reduce((acc, r) => acc + activeAppliances.reduce((s, ap) => s + (r[ap] || 0), 0), 0);

    const previousPeriodTotal = () => {
      if (viewMode === 'monthly') {
        const idx = months.indexOf(selectedPeriodKey);
        if (idx <= 0) return null;
        const prevKey = months[idx - 1];
        const [Y,M] = prevKey.split('-').map(Number);
        const dim = new Date(Y, M, 0).getDate();
        const rows = [];
        for (let d = 1; d <= dim; d++) {
          const k = `${Y}-${pad(M)}-${pad(d)}`;
          rows.push(buildRow(k).row);
        }
        return +sumAcross(rows).toFixed(2);
      }
      if (viewMode === 'weekly') {
        const idx = weeks.findIndex(w => w.key === selectedPeriodKey);
        if (idx <= 0) return null;
        const prevKey = weeks[idx - 1].key;
        const monKey = prevKey.replace('__WEEK', '');
        const start = new Date(`${monKey}T00:00:00`);
        const rows = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          rows.push(buildRow(ymd(d)).row);
        }
        return +sumAcross(rows).toFixed(2);
      }
      return null;
    };

    if (viewMode === 'today') {
      const { row, sum } = buildRow(todayKey);
      return {
        chartData: [row],
        total: sum,
        soFar: sum,
        savings: null,
        periodTitle: today.toDateString()
      };
    }

    if (viewMode === 'monthly') {
      const [Y,M] = selectedPeriodKey.split('-').map(Number);
      const dim = new Date(Y, M, 0).getDate();
      const monthIdx = M - 1;
      const rows = [];
      for (let d = 1; d <= dim; d++) {
        const k = `${Y}-${pad(M)}-${pad(d)}`;
        rows.push(buildRow(k).row);
      }
      const total = +sumAcross(rows).toFixed(2);
      const soFar = +sumAcross(rows.filter(r => r.date <= todayKey)).toFixed(2);
      const prev = previousPeriodTotal();
      const savings = prev == null ? null : +(prev - total).toFixed(2);
      return { chartData: rows, total, soFar, savings, periodTitle: `${MONTH_NAMES[monthIdx]} ${Y}` };
    }

    if (viewMode === 'weekly') {
      const monKey = selectedPeriodKey.replace('__WEEK', '');
      const start = new Date(`${monKey}T00:00:00`);
      const rows = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        rows.push(buildRow(ymd(d)).row);
      }
      const total = +sumAcross(rows).toFixed(2);
      const soFar = +sumAcross(rows.filter(r => r.date <= todayKey)).toFixed(2);
      const prev = previousPeriodTotal();
      const savings = prev == null ? null : +(prev - total).toFixed(2);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { chartData: rows, total, soFar, savings, periodTitle: `${start.toLocaleDateString()} – ${end.toLocaleDateString()}` };
    }

    return { chartData: [], total: 0, soFar: 0, savings: null, periodTitle: '' };
  }, [selectedPeriodKey, viewMode, byDayAppliance, activeAppliances, costPerKWh, months, weeks]);

  const periodOptions = useMemo(() => {
    if (viewMode === 'monthly') {
      return months.map(k => {
        const [Y,M] = k.split('-').map(Number);
        return { key: k, label: `${MONTH_NAMES[M-1]} ${Y}` };
      });
    }
    if (viewMode === 'weekly') {
      return weeks.map(w => ({ key: w.key, label: `${w.start.toLocaleDateString()} – ${new Date(+w.start + 6*24*3600*1000).toLocaleDateString()}` }));
    }
    return [];
  }, [viewMode, months, weeks]);

  const selectStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: darkMode ? '#333' : '#fff',
      borderColor: darkMode ? '#666' : '#aaa',
      color: darkMode ? '#f5f5f5' : '#000',
      minWidth: 260
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: darkMode ? '#333' : '#fff',
      color: darkMode ? '#f5f5f5' : '#000'
    }),
    multiValue: (b) => ({ ...b, backgroundColor: darkMode ? '#444' : '#e6f3ff' }),
    multiValueLabel: (b) => ({ ...b, color: darkMode ? '#fff' : '#000' })
  };

  const fmt = (v) => (v == null ? '—' : `MUR ${v.toFixed(2)}`);

  return (
    <div style={{ backgroundColor: darkMode ? '#1e1e1e' : '#fff', color: darkMode ? '#f5f5f5' : '#333', minHeight: '100vh', padding: '30px' }}>
      <h2 style={{ marginBottom: '20px' }}>💰 Electricity Cost Dashboard</h2>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <button onClick={() => setViewMode('today')} style={{ padding: '10px 16px', marginRight: 10, backgroundColor: viewMode === 'today' ? '#007bff' : '#444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Today</button>
          <button onClick={() => setViewMode('weekly')} style={{ padding: '10px 16px', marginRight: 10, backgroundColor: viewMode === 'weekly' ? '#007bff' : '#444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Weekly</button>
          <button onClick={() => setViewMode('monthly')} style={{ padding: '10px 16px', backgroundColor: viewMode === 'monthly' ? '#007bff' : '#444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Monthly</button>
        </div>

        {viewMode !== 'today' && (
          <div>
            <label style={{ fontWeight: 600, marginRight: 8 }}>{viewMode === 'monthly' ? 'Month:' : 'Week:'}</label>
            <select value={selectedPeriodKey} onChange={(e) => setSelectedPeriodKey(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #888', backgroundColor: darkMode ? '#333' : '#fff', color: darkMode ? '#f5f5f5' : '#000' }}>
              {periodOptions.length === 0 && <option value="">(No periods found)</option>}
              {periodOptions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={{ fontWeight: 600 }}>Cost per kWh (MUR): </label>
          <input type="number" step="0.01" value={costPerKWh} onChange={(e) => setCostPerKWh(parseFloat(e.target.value || '0'))} style={{ padding: 8, marginLeft: 10, borderRadius: 6, border: '1px solid #888', backgroundColor: darkMode ? '#333' : '#fff', color: darkMode ? '#f5f5f5' : '#000', width: 120 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Filter by Appliances:</label>
          <input type="checkbox" checked={filterEnabled} onChange={(e) => { const on = e.target.checked; setFilterEnabled(on); if (on && selectedAppliances.length === 0) setSelectedAppliances(allAppliances); }} />
        </div>

        {filterEnabled && (
          <Select isMulti options={applianceOptions} value={applianceOptions.filter(o => selectedAppliances.includes(o.value))} onChange={(vals) => setSelectedAppliances(vals.map(v => v.value))} styles={selectStyles} placeholder="Select appliances..." />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '20px' }}>
        {[{ title: viewMode === 'weekly' ? 'This Week' : viewMode === 'monthly' ? 'This Month' : 'Today', value: total }, { title: 'So Far', value: soFar }, { title: 'Estimated Savings', value: savings }].map((item, i) => (
          <div key={i} style={{ backgroundColor: darkMode ? '#292929' : '#f0f0f0', padding: '20px', borderRadius: '10px', flex: '1', textAlign: 'center', minWidth: '180px' }}>
            <h4>{item.title}</h4>
            <h2 style={{ color: '#00ff99' }}>{fmt(item.value)}</h2>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: darkMode ? '#292929' : '#fafafa', padding: 20, borderRadius: 10 }}>
        <h3 style={{ marginBottom: 10 }}>📊 {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} Cost {periodTitle ? `— ${periodTitle}` : ''}</h3>
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#444" : "#ccc"} />
            <XAxis dataKey="date" stroke={darkMode ? "#ccc" : "#333"} />
            <YAxis stroke={darkMode ? "#ccc" : "#333"} />
            <Tooltip contentStyle={{ backgroundColor: darkMode ? '#333' : '#fff', border: 'none', color: darkMode ? '#fff' : '#000' }} formatter={(v, name) => [`MUR ${v}`, name]} />
            <Legend wrapperStyle={{ color: darkMode ? '#fff' : '#000' }} />
            {activeAppliances.map((ap, i) => (
              <Bar key={ap} dataKey={ap} name={ap} fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CostPage;
