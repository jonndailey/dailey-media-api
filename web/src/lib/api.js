import { daileyAuth } from './auth.js';

// Base API URL - use proxy in development, direct URL in production
const API_BASE_URL = import.meta.env.DEV ? '/api' : 'http://localhost:5173/api';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Get auth headers if user is authenticated
    const authHeaders = daileyAuth.isAuthenticated() ? daileyAuth.getAuthHeaders() : {};
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      // Handle authentication errors
      if (response.status === 401) {
        // Token expired or invalid
        daileyAuth.logout();
        window.location.reload(); // This will trigger the login form
        throw new Error('Authentication required');
      }

      // Handle other errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // GET request
  async get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  // POST request
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT request
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE request
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Upload file with form data
  async uploadFile(file, options = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add any additional form fields
    Object.entries(options).forEach(([key, value]) => {
      formData.append(key, value);
    });

    const authHeaders = daileyAuth.isAuthenticated() ? {
      'Authorization': daileyAuth.getAuthHeaders().Authorization
    } : {};

    try {
      const response = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        headers: authHeaders, // Don't set Content-Type for FormData
        body: formData,
      });

      if (response.status === 401) {
        daileyAuth.logout();
        window.location.reload();
        throw new Error('Authentication required');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed: HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }

  // Upload multiple files
  async uploadFiles(files, options = {}) {
    const formData = new FormData();
    
    files.forEach((file) => {
      formData.append('files', file);
    });
    
    // Add any additional form fields
    Object.entries(options).forEach(([key, value]) => {
      formData.append(key, value);
    });

    const authHeaders = daileyAuth.isAuthenticated() ? {
      'Authorization': daileyAuth.getAuthHeaders().Authorization
    } : {};

    try {
      const response = await fetch(`${this.baseUrl}/upload/batch`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (response.status === 401) {
        daileyAuth.logout();
        window.location.reload();
        throw new Error('Authentication required');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Batch upload failed: HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Batch upload failed:', error);
      throw error;
    }
  }

  // Specific API methods
  async getFiles(params = {}) {
    return this.get('/files', params);
  }

  async getFile(id) {
    return this.get(`/files/${id}`);
  }

  async deleteFile(id, permanent = false) {
    return this.delete(`/files/${id}${permanent ? '?permanent=true' : ''}`);
  }

  async getAnalytics(timeRange = '7d') {
    return this.get('/analytics', { timeRange });
  }

  async getUploadFormats() {
    return this.get('/upload/formats');
  }

  async checkHealth() {
    return this.get('/health').catch(() => ({ status: 'unavailable' }));
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for custom instances
export default ApiClient;