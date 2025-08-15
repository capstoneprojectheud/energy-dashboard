import React from 'react';

const AppliancesPage = ({ darkMode }) => {
  return (
    <div
      style={{
        backgroundColor: darkMode ? '#1e1e1e' : '#fff',
        color: darkMode ? '#f5f5f5' : '#333',
        minHeight: '100vh',
        padding: '20px',
        borderRadius: '8px'
      }}
    >
      <h2>📱 Appliances</h2>
      <p>Coming soon...</p>
    </div>
  );
};

export default AppliancesPage;
