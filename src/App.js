import React, { useState } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import './App.css';

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [darkMode, setDarkMode] = useState(true); // Default to dark mode

  const toggleDarkMode = () => setDarkMode(!darkMode);

  return (
    <div className={darkMode ? 'dark-mode' : 'light-mode'}>
      {loggedIn ? (
        <Dashboard
          onLogout={() => setLoggedIn(false)}
          toggleTheme={toggleDarkMode}
          darkMode={darkMode}
        />
      ) : (
        <Login onLogin={setLoggedIn} />
      )}
    </div>
  );
}

export default App;
