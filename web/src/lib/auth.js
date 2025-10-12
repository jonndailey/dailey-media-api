// DAILEY CORE Authentication Service for Dailey Media API
class DaileyAuth {
  constructor(baseUrl = null, appName = 'Dailey Media API') {
    // In development, use proxy (relative URLs), in production use direct URL
    this.baseUrl = baseUrl || (import.meta.env.DEV ? '' : 'http://localhost:3002');
    this.appName = appName;
    this.token = localStorage.getItem('auth_token');
    this.user = null;
    this.roles = [];
  }

  async login(email, password) {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Important: Add these headers for proper audit log context
          'X-Application': this.appName,
          'X-App-Name': this.appName,
          'X-Client-Id': this.appName.toLowerCase().replace(/\s+/g, '-')
        },
        credentials: 'include',
        body: JSON.stringify({ 
          email, 
          password,
          app_name: this.appName,  // App is now registered in DAILEY CORE
          app_id: '77777777-7777-7777-7777-777777777777'  // Dailey Media API UUID
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      if (data.access_token) {
        this.token = data.access_token;
        this.user = data.user;
        localStorage.setItem('auth_token', this.token);
        
        // Get user roles
        await this.validateToken();
        
        return data;
      }
      
      throw new Error('No access token received');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async validateToken() {
    if (!this.token) return null;
    
    try {
      const response = await fetch(`${this.baseUrl}/auth/validate`, {
        headers: { 
          'Authorization': `Bearer ${this.token}`,
          'X-Application': this.appName
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        if (userData.valid) {
          this.user = userData.user;
          this.roles = userData.roles || [];
          return userData;
        }
      }
      
      // Token invalid, clear it
      this.logout();
      return null;
    } catch (error) {
      console.error('Token validation error:', error);
      this.logout();
      return null;
    }
  }

  async logout() {
    try {
      if (this.token) {
        await fetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${this.token}`,
            'X-Application': this.appName
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Ignore logout errors - clean up local state anyway
    }
    
    this.token = null;
    this.user = null;
    this.roles = [];
    localStorage.removeItem('auth_token');
  }

  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  hasRole(role) {
    return this.roles.includes(role);
  }

  hasAnyRole(roles) {
    return roles.some(role => this.roles.includes(role));
  }

  isAdmin() {
    return this.hasAnyRole(['core.admin', 'tenant.admin']);
  }

  canUpload() {
    return this.hasAnyRole(['user', 'api.write', 'core.admin', 'tenant.admin']);
  }

  canViewAnalytics() {
    return this.hasAnyRole(['core.admin', 'tenant.admin', 'analytics.viewer']);
  }

  // Make authenticated requests to Dailey Media API
  async makeAuthenticatedRequest(url, options = {}) {
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      ...options.headers
    };
    
    // Only set Content-Type for non-FormData requests
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    // If 401, try to refresh or redirect to login
    if (response.status === 401) {
      this.logout();
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    return response;
  }

  // Get auth headers for manual requests
  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'X-Application': this.appName
    };
  }

  // Helper method to check if DAILEY CORE is available
  async checkAuthServiceHealth() {
    try {
      // In development, use proxy (relative URL), in production use direct URL
      const healthUrl = import.meta.env.DEV ? '/auth/health' : `${this.baseUrl}/health`;
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.status === 'healthy';
      }
      
      return false;
    } catch (error) {
      console.error('DAILEY CORE service check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const daileyAuth = new DaileyAuth();

// Export class for custom instances
export default DaileyAuth;