import { useState, useEffect } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import DocsTab from './components/DocsTab.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginForm from './components/LoginForm'

// Main authenticated app content
function AuthenticatedApp() {
  const [activeTab, setActiveTab] = useState('upload')
  const [error, setError] = useState(null)
  const { user, logout, isAdmin, canViewAnalytics } = useAuth()

  // Simple error boundary
  useEffect(() => {
    const handleError = (event) => {
      console.error('App error:', event.error)
      setError(event.error?.message || 'An error occurred')
    }
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg">
          <h1 className="text-xl font-bold text-red-600 mb-2">Application Error</h1>
          <p className="text-gray-700">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">D</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                  Dailey Media API
                </h1>
                <div className="text-sm text-slate-500 font-medium">
                  Universal Content Platform
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="px-3 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                ✓ System Ready
              </div>
              
              {/* User Menu */}
              <div className="flex items-center space-x-3 border-l border-slate-200 pl-3">
                <div className="text-right">
                  <div className="text-sm font-medium text-slate-900">{user?.email}</div>
                  {isAdmin() && <div className="text-xs text-blue-600">Administrator</div>}
                </div>
                <button
                  onClick={logout}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200/60">
          <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
            <Tabs.List className="flex border-b border-slate-200">
              <Tabs.Trigger 
                value="upload" 
                className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
              >
                📤 Upload Files
              </Tabs.Trigger>
              <Tabs.Trigger 
                value="files" 
                className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
              >
                📁 Browse Files
              </Tabs.Trigger>
              {canViewAnalytics() && (
                <Tabs.Trigger 
                  value="stats" 
                  className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
                >
                  📊 Analytics
                </Tabs.Trigger>
              )}
              <Tabs.Trigger 
                value="docs" 
                className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
              >
                📚 Documentation
              </Tabs.Trigger>
            </Tabs.List>

            <div className="p-6">
              <Tabs.Content value="upload">
                <UploadSection />
              </Tabs.Content>
              
              <Tabs.Content value="files">
                <FilesSection />
              </Tabs.Content>
              
              
              {canViewAnalytics() && (
                <Tabs.Content value="stats">
                  <StatsSection />
                </Tabs.Content>
              )}
              
              <Tabs.Content value="docs">
                <DocsTab />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </div>
      </main>
    </div>
  )
}

// Simple Upload Section
function UploadSection() {
  const [isDragging, setIsDragging] = useState(false)
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Upload Files</h2>
        <p className="text-slate-600">Upload any type of file - images, documents, code, archives, and more!</p>
      </div>
      
      <div 
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false) }}
      >
        <div className="space-y-4">
          <div className="text-4xl">📁</div>
          <div>
            <p className="text-lg font-medium text-slate-900">Drop files here or click to browse</p>
            <p className="text-sm text-slate-500 mt-1">Supports ALL file types - Max 100MB per file</p>
          </div>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Choose Files
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl mb-2">🖼️</div>
          <div className="font-medium">Images</div>
          <div className="text-sm text-slate-500">Auto-generates thumbnails</div>
        </div>
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl mb-2">📄</div>
          <div className="font-medium">Documents</div>
          <div className="text-sm text-slate-500">PDF, Office, Text files</div>
        </div>
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl mb-2">📦</div>
          <div className="font-medium">Any File</div>
          <div className="text-sm text-slate-500">Universal storage</div>
        </div>
      </div>
    </div>
  )
}

// Simple Files Section
function FilesSection() {
  const [files] = useState([])
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Your Files</h2>
        <p className="text-slate-600">Browse and manage all your uploaded files</p>
      </div>
      
      {files.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <div className="text-4xl mb-4">📂</div>
          <p className="text-slate-600">No files uploaded yet</p>
          <p className="text-sm text-slate-500 mt-2">Upload some files to see them here</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {/* Files would go here */}
        </div>
      )}
    </div>
  )
}


// Simple Stats Section
function StatsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Analytics & Usage Stats</h2>
        <p className="text-slate-600">Monitor file access patterns and usage trends</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl mb-2">📊</div>
          <div className="font-medium">Total Files</div>
          <div className="text-2xl font-bold text-slate-900">1,247</div>
          <div className="text-sm text-slate-500">15.3 GB stored</div>
        </div>
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl mb-2">👁️</div>
          <div className="font-medium">Total Accesses</div>
          <div className="text-2xl font-bold text-slate-900">8,923</div>
          <div className="text-sm text-slate-500">This month</div>
        </div>
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl mb-2">⚡</div>
          <div className="font-medium">Response Time</div>
          <div className="text-2xl font-bold text-slate-900">127ms</div>
          <div className="text-sm text-green-600">Fast</div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg p-4">
        <h3 className="font-medium text-slate-900 mb-3">File Types Distribution</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Images</span>
            <span className="text-sm font-medium">523 files (53.6%)</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full" style={{width: '53.6%'}}></div>
          </div>
        </div>
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Documents</span>
            <span className="text-sm font-medium">298 files (20.2%)</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full" style={{width: '20.2%'}}></div>
          </div>
        </div>
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Videos</span>
            <span className="text-sm font-medium">156 files (18.3%)</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div className="bg-purple-500 h-2 rounded-full" style={{width: '18.3%'}}></div>
          </div>
        </div>
      </div>

      <div className="text-center py-8 bg-blue-50 rounded-lg border border-blue-200">
        <div className="text-4xl mb-4">🚀</div>
        <p className="text-blue-900 font-medium mb-2">Advanced Analytics Coming Soon!</p>
        <p className="text-sm text-blue-700">Real-time monitoring, detailed insights, and comprehensive reporting features are in development.</p>
      </div>
    </div>
  )
}


// Auth-aware app wrapper
function AppWithAuth() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">D</span>
          </div>
          <div className="text-2xl mb-2">Loading...</div>
          <p className="text-slate-600">Checking authentication status</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <AuthenticatedApp /> : <LoginForm />;
}

// Main App component with auth provider
function App() {
  return (
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  );
}

export default App