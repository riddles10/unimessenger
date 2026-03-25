import React, { useState, useEffect } from 'react';
import InboxPage from './pages/inbox/InboxPage';
import LoginPage from './pages/LoginPage';
import { verifyToken } from './utils/api';

function App() {
  const [auth, setAuth] = useState({ checked: false, user: null });

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setAuth({ checked: true, user: null });
      return;
    }

    verifyToken()
      .then(({ user }) => setAuth({ checked: true, user }))
      .catch(() => {
        localStorage.removeItem('auth_token');
        setAuth({ checked: true, user: null });
      });
  }, []);

  const handleLogin = (token, user) => {
    localStorage.setItem('auth_token', token);
    setAuth({ checked: true, user });
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setAuth({ checked: true, user: null });
  };

  if (!auth.checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0E14]">
        <div className="w-8 h-8 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!auth.user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <InboxPage user={auth.user} onLogout={handleLogout} />;
}

export default App;
