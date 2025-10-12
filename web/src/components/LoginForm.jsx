import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginForm() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login, isHealthy } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(formData.email, formData.password);
      // Login successful - the auth context will handle the redirect
    } catch (error) {
      setError(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  if (!isHealthy) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        {/* Iceberg-themed split background */}
        <div className="absolute inset-0">
          {/* Above water - sky blue gradient */}
          <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-sky-200 via-sky-300 to-sky-400"></div>
          {/* Below water - deep blue gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-b from-blue-600 via-blue-800 to-blue-900"></div>
          {/* Water line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/30 transform -translate-y-0.5"></div>
        </div>
        <div className="relative z-10 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/20">
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <img 
                src="/android-chrome-192x192.png" 
                alt="Dailey Media API Logo" 
                className="w-48 h-48"
              />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Service Unavailable</h2>
            <p className="text-slate-600 mb-4">
              DAILEY CORE authentication service is currently unavailable.
            </p>
            <p className="text-sm text-slate-500">
              Please try again later or contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      {/* Iceberg-themed split background */}
      <div className="absolute inset-0">
        {/* Above water - sky blue gradient */}
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-sky-200 via-sky-300 to-sky-400"></div>
        {/* Below water - deep blue gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-b from-blue-600 via-blue-800 to-blue-900"></div>
        {/* Water line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/30 transform -translate-y-0.5"></div>
      </div>
      <div className="relative z-10 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/20">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/android-chrome-192x192.png" 
              alt="Dailey Media API Logo" 
              className="w-48 h-48"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">DAILEY MEDIA API</h1>
          <p className="text-slate-600 text-sm mt-2">Sign in to your account</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <span className="text-red-600 mr-2">⚠️</span>
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Signing in...
              </div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-500">
            Powered by DAILEY CORE Authentication
          </p>
        </div>
      </div>
    </div>
  );
}