// src/Dashboard.js
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import EnergyDashboard from './EnergyDashboard';
import CostPage from './CostPage';
import Appliances from './Appliances';
import './Sidebar.css';
 
const Dashboard = ({ onLogout, toggleTheme, darkMode }) => {
  const [selectedPage, setSelectedPage] = useState('dashboard');
 
  const renderPage = () => {
    switch (selectedPage) {
      case 'dashboard':
        return <EnergyDashboard darkMode={darkMode} />;
      case 'cost':
        return <CostPage darkMode={darkMode} />;
      case 'appliances':
        return <Appliances darkMode={darkMode} />;
      default:
        return <EnergyDashboard darkMode={darkMode} />;
    }
  };
 
  return (
<div style={{ display: 'flex' }}>
<Sidebar onSelect={setSelectedPage} darkMode={darkMode} />
<div style={{ marginLeft: '220px', padding: '20px', width: '100%' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
<button onClick={toggleTheme}>
            {darkMode ? 'Light Mode' : 'Dark Mode'}
</button>
<button onClick={onLogout}>Logout</button>
</div>
        {renderPage()}
</div>
</div>
  );
};
 
export default Dashboard;