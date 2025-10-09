import React, { createContext, useContext, useState, useEffect } from 'react';
import { daileyAuth } from '../lib/auth.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isHealthy, setIsHealthy] = useState(false);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Check if DAILEY CORE is available
      const healthCheck = await daileyAuth.checkAuthServiceHealth();
      setIsHealthy(healthCheck);
      
      if (!healthCheck) {
        console.warn('DAILEY CORE auth service is not available');
        setLoading(false);
        return;
      }

      // Try to validate existing token
      const userData = await daileyAuth.validateToken();
      if (userData && userData.valid) {
        setUser(userData.user);
        setRoles(userData.roles || []);
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const result = await daileyAuth.login(email, password);
      setUser(result.user);
      setRoles(daileyAuth.roles);
      return result;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await daileyAuth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    setUser(null);
    setRoles([]);
  };

  const hasRole = (role) => roles.includes(role);
  const hasAnyRole = (roleList) => roleList.some(role => roles.includes(role));
  const isAdmin = () => hasAnyRole(['core.admin', 'tenant.admin']);
  const canUpload = () => hasAnyRole(['user', 'api.write', 'core.admin', 'tenant.admin']);
  const canViewAnalytics = () => hasAnyRole(['core.admin', 'tenant.admin', 'analytics.viewer']);

  const value = {
    user,
    roles,
    loading,
    isHealthy,
    login,
    logout,
    hasRole,
    hasAnyRole,
    isAdmin,
    canUpload,
    canViewAnalytics,
    isAuthenticated: !!user,
    auth: daileyAuth // Expose auth instance for making requests
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// HOC for protected components
export function withAuth(Component, requiredRoles = []) {
  return function AuthenticatedComponent(props) {
    const { isAuthenticated, hasAnyRole, loading } = useAuth();

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl">🔄</div>
            <p className="text-slate-600 mt-2">Checking authentication...</p>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-lg">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Authentication Required</h2>
            <p className="text-slate-600 mb-4">Please log in to access Dailey Media API</p>
            <button 
              onClick={() => window.location.href = '/login'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go to Login
            </button>
          </div>
        </div>
      );
    }

    if (requiredRoles.length > 0 && !hasAnyRole(requiredRoles)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-lg">
            <div className="text-4xl mb-4">⛔</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-600 mb-4">You don't have permission to access this resource</p>
            <p className="text-sm text-slate-500">Required roles: {requiredRoles.join(', ')}</p>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}