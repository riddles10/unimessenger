import React, { useState } from 'react';
import { login } from '../utils/api';

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(email, password);
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-[#00e5ff] flex items-center justify-center mb-4 text-black font-bold text-2xl">
            P
          </div>
          <h1 className="text-white text-xl font-semibold tracking-wide">Pipsight Inbox</h1>
          <p className="text-[#8a91a4] text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[#131722] border border-[#2a2e39] rounded-2xl p-6 space-y-5">
          {error && (
            <div className="bg-[rgba(255,51,102,0.1)] border border-[#ff3366] text-[#ff3366] text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[#8a91a4] text-xs font-medium mb-2 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="agent@pipsight.com"
              className="w-full bg-[#0B0E14] border border-[#2a2e39] rounded-lg px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] transition-all"
            />
          </div>

          <div>
            <label className="block text-[#8a91a4] text-xs font-medium mb-2 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-[#0B0E14] border border-[#2a2e39] rounded-lg px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-black transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #00e5ff, #00bfff)' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
