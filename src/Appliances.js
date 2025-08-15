// src/Appliances.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import Select from 'react-select';
import './Appliances.css';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hourLabel = (h) => `${pad(h)}:00`;
const mondayOfWeek = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1 - day); // Monday start
  x.setDate(x.getDate() + diff);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const COLORS = ['#00bfff','#82ca9d','#ffc658','#ff7f50','#8a2be2','#ff69b4','#00c49f','#d0ed57','#a4de6c'];

const Appliances = ({ darkMode }) => {
  const [raw, setRaw] = useState([]);
  const [viewMode, setViewMode] = useState('today'); // today | weekly | monthly
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(''); // YYYY-MM or YYYY-MM-DD__WEEK or today's date
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [selectedAppliances, setSelectedAppliances] = useState([]);

  // fetch data
  useEffect(() => {
    fetch('https://27262b3f8626.ngrok-free.app/api/data', {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    })
      .then((res) => res.json())
      .then((json) => {
        const cleaned = json.filter(e => e.Timestamp && !String(e.Timestamp).startsWith('1970'));
        setRaw(cleaned);
      })
      .catch(() => setRaw([]));
  }, []);

  // list of all appliances in data
  const allAppliances = useMemo(() => {
    const s = new Set(raw.map(e => e.Appliance).filter(Boolean));
    return [...s].sort();
  }, [raw]);

  // default to all appliances when filter is off
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

  // Map of day -> Map(appliance -> kWh)
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

  // Available periods
  const months = useMemo(() => {
    const set = new Set();
    for (const key of byDayAppliance.keys()) {
      const [Y, M] = key.split('-');
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
      .map(([monKey, { start, end }]) => ({ key: `${monKey}__WEEK`, start, end }))
      .sort((a, b) => a.start - b.start);
  }, [byDayAppliance]);

  // sync selectedPeriodKey with view
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

  // chart data
  const chartData = useMemo(() => {
    if (activeAppliances.length === 0) return [];

    // TODAY: hourly bars
    if (viewMode === 'today') {
      const todayKey = ymd(new Date());
      const rows = Array.from({ length: 24 }, (_, h) => {
        const row = { date: hourLabel(h) };
        for (const ap of activeAppliances) row[ap] = 0;
        return row;
      });
      for (const e of raw) {
        if (!e.Appliance) continue;
        const d = new Date(e.Timestamp);
        if (ymd(d) !== todayKey) continue;
        const h = d.getHours();
        const kwh = parseFloat(e['Energy Usage (kWh)']) || 0;
        const ap = e.Appliance;
        if (activeAppliances.includes(ap)) {
          rows[h][ap] = +(rows[h][ap] + kwh).toFixed(2);
        }
      }
      return rows;
    }

    const buildRow = (dayKey) => {
      const map = byDayAppliance.get(dayKey) || new Map();
      const row = { date: dayKey };
      for (const ap of activeAppliances) row[ap] = +(map.get(ap) || 0).toFixed(2);
      return row;
    };

    // MONTHLY: daily rows
    if (viewMode === 'monthly' && selectedPeriodKey) {
      const [Y, M] = selectedPeriodKey.split('-').map(Number);
      const dim = new Date(Y, M, 0).getDate();
      const rows = [];
      for (let d = 1; d <= dim; d++) {
        rows.push(buildRow(`${Y}-${pad(M)}-${pad(d)}`));
      }
      return rows;
    }

    // WEEKLY: daily rows Mon–Sun
    if (viewMode === 'weekly' && selectedPeriodKey) {
      const monKey = selectedPeriodKey.replace('__WEEK', '');
      const start = new Date(`${monKey}T00:00:00`);
      const rows = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        rows.push(buildRow(ymd(d)));
      }
      return rows;
    }

    return [];
  }, [viewMode, selectedPeriodKey, activeAppliances, byDayAppliance, raw]);

  // dropdown options for period
  const periodOptions = useMemo(() => {
    if (viewMode === 'monthly') {
      return months.map(k => {
        const [Y, M] = k.split('-').map(Number);
        return { key: k, label: `${MONTH_NAMES[M - 1]} ${Y}` };
      });
    }
    if (viewMode === 'weekly') {
      return weeks.map(w => ({
        key: w.key,
        label: `${w.start.toLocaleDateString()} – ${new Date(+w.start + 6 * 24 * 3600 * 1000).toLocaleDateString()}`
      }));
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

  return (
    <div
      style={{
        backgroundColor: darkMode ? '#1e1e1e' : '#fff',
        color: darkMode ? '#f5f5f5' : '#333',
        minHeight: '100vh',
        padding: '30px'
      }}
    >
      <h2 style={{ marginBottom: '20px' }}>📊 Energy Usage by Appliance</h2>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <button
            onClick={() => setViewMode('today')}
            style={{
              padding: '10px 16px',
              marginRight: 10,
              backgroundColor: viewMode === 'today' ? '#007bff' : '#444',
              color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer'
            }}
          >Today</button>
          <button
            onClick={() => setViewMode('weekly')}
            style={{
              padding: '10px 16px',
              marginRight: 10,
              backgroundColor: viewMode === 'weekly' ? '#007bff' : '#444',
              color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer'
            }}
          >Weekly</button>
          <button
            onClick={() => setViewMode('monthly')}
            style={{
              padding: '10px 16px',
              backgroundColor: viewMode === 'monthly' ? '#007bff' : '#444',
              color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer'
            }}
          >Monthly</button>
        </div>

        {/* Week/Month selector */}
        {viewMode !== 'today' && (
          <div>
            <label style={{ fontWeight: 600, marginRight: 8 }}>
              {viewMode === 'monthly' ? 'Month:' : 'Week:'}
            </label>
            <select
              value={selectedPeriodKey}
              onChange={(e) => setSelectedPeriodKey(e.target.value)}
              style={{
                padding: 8, borderRadius: 6, border: '1px solid #888',
                backgroundColor: darkMode ? '#333' : '#fff',
                color: darkMode ? '#f5f5f5' : '#000'
              }}
            >
              {periodOptions.length === 0 && <option value="">(No periods found)</option>}
              {periodOptions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
        )}

        {/* Appliance filter toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Filter by Appliances:</label>
          <input
            type="checkbox"
            checked={filterEnabled}
            onChange={(e) => {
              const on = e.target.checked;
              setFilterEnabled(on);
              if (on && selectedAppliances.length === 0) setSelectedAppliances(allAppliances);
            }}
          />
        </div>

        {/* Multi-select */}
        {filterEnabled && (
          <Select
            isMulti
            options={applianceOptions}
            value={applianceOptions.filter(o => selectedAppliances.includes(o.value))}
            onChange={(vals) => setSelectedAppliances(vals.map(v => v.value))}
            styles={selectStyles}
            placeholder="Select appliances..."
          />
        )}
      </div>

      {/* Chart */}
      <div style={{ backgroundColor: darkMode ? '#292929' : '#fafafa', padding: 20, borderRadius: 10 }}>
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#444" : "#ccc"} />
            <XAxis dataKey="date" stroke={darkMode ? "#ccc" : "#333"} />
            <YAxis stroke={darkMode ? "#ccc" : "#333"} label={{ value: 'kWh', angle: -90, position: 'insideLeft' }} />
            <Tooltip
              contentStyle={{ backgroundColor: darkMode ? '#333' : '#fff', border: 'none', color: darkMode ? '#fff' : '#000' }}
              formatter={(v, name) => [`${v} kWh`, name]}
            />
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

export default Appliances;
