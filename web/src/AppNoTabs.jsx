import { useState, useEffect } from 'react'
import { Upload, Folder, BookOpen, FolderOpen, KeyRound } from 'lucide-react'

function AppNoTabs() {
  const [activeTab, setActiveTab] = useState('upload')
  const [error, setError] = useState(null)

  // Simple error boundary
  useEffect(() => {
    console.log('Setting up error handler')
    const handleError = (event) => {
      console.error('App error:', event.error)
      setError(event.error?.message || 'An error occurred')
    }
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  console.log('AppNoTabs rendering, error:', error)

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
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Without Tabs */}
      <main className="container mx-auto px-6 py-8">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200/60">
          {/* Simple Tab Navigation */}
          <div className="flex border-b border-slate-200">
            <button 
              onClick={() => setActiveTab('upload')}
              className={`flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 ${
                activeTab === 'upload' ? 'border-b-2 border-blue-500 text-blue-600' : ''
              }`}
            >
              <Upload className="w-4 h-4 inline mr-2" />
              Upload Files
            </button>
            <button 
              onClick={() => setActiveTab('files')}
              className={`flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 ${
                activeTab === 'files' ? 'border-b-2 border-blue-500 text-blue-600' : ''
              }`}
            >
              <Folder className="w-4 h-4 inline mr-2" />
              Browse Files
            </button>
            <button 
              onClick={() => setActiveTab('api')}
              className={`flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 ${
                activeTab === 'api' ? 'border-b-2 border-blue-500 text-blue-600' : ''
              }`}
            >
              <KeyRound className="w-4 h-4 inline mr-2" />
              API Keys
            </button>
            <button 
              onClick={() => setActiveTab('docs')}
              className={`flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 ${
                activeTab === 'docs' ? 'border-b-2 border-blue-500 text-blue-600' : ''
              }`}
            >
              <BookOpen className="w-4 h-4 inline mr-2" />
              Documentation
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'upload' && <UploadSection />}
            {activeTab === 'files' && <FilesSection />}
            {activeTab === 'api' && <ApiKeysSection />}
            {activeTab === 'docs' && <DocsSection />}
          </div>
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
          <FolderOpen className="w-16 h-16 mx-auto text-slate-400" />
          <div>
            <p className="text-lg font-medium text-slate-900">Drop files here or click to browse</p>
            <p className="text-sm text-slate-500 mt-1">Supports ALL file types - Max 100MB per file</p>
          </div>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Choose Files
          </button>
        </div>
      </div>
    </div>
  )
}

// Simple Files Section
function FilesSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Your Files</h2>
        <p className="text-slate-600">Browse and manage all your uploaded files</p>
      </div>
      
      <div className="text-center py-12 bg-slate-50 rounded-lg">
        <div className="mb-4 flex justify-center">
          <Folder className="w-10 h-10 text-slate-400" />
        </div>
        <p className="text-slate-600">No files uploaded yet</p>
        <p className="text-sm text-slate-500 mt-2">Upload some files to see them here</p>
      </div>
    </div>
  )
}

// Simple API Keys Section
function ApiKeysSection() {
  const defaultKey = 'dmapi_dev_' + '•'.repeat(32)
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">API Keys</h2>
        <p className="text-slate-600">Manage your API keys for secure access</p>
      </div>
      
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-slate-900">Default Development Key</div>
            <div className="text-sm text-slate-500 mt-1">Auto-generated for development</div>
          </div>
          <div className="flex items-center space-x-2">
            <code className="px-3 py-1 bg-slate-100 rounded text-sm font-mono">{defaultKey}</code>
            <button className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-sm">Copy</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Simple Docs Section
function DocsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">API Documentation</h2>
        <p className="text-slate-600">Learn how to use the Dailey Media API</p>
      </div>
      
      <div className="border border-slate-200 rounded-lg p-4">
        <h3 className="font-medium text-slate-900 mb-2">Quick Start</h3>
        <pre className="text-sm bg-slate-50 p-3 rounded overflow-x-auto">
{`# Upload a file
curl -X POST http://api.example.com/upload \\
  -H "X-API-Key: your-api-key" \\
  -F "file=@/path/to/file.pdf"`}
        </pre>
      </div>
    </div>
  )
}

export default AppNoTabs
