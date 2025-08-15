import React from 'react';
import './Sidebar.css';

const Sidebar = ({ onSelect, darkMode }) => {
  return (
    <div className={`sidebar ${darkMode ? 'dark' : 'light'}`}>
      <h2>Menu</h2>
      <ul>
        <li onClick={() => onSelect('dashboard')}>Dashboard</li>
        <li onClick={() => onSelect('cost')}>Cost</li>
        <li onClick={() => onSelect('appliances')}>Appliances</li>
      </ul>
    </div>
  );
};

export default Sidebar;
