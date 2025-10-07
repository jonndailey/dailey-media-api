import { useState, useEffect } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { 
  Upload, 
  FileImage, 
  Activity, 
  BookOpen, 
  Server,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react'
import UploadTab from './components/UploadTab'
import MediaTab from './components/MediaTab'
import DocsTab from './components/DocsTab'
import MonitorTab from './components/MonitorTab'
import { cn } from './lib/utils'

function App() {
  const [apiHealth, setApiHealth] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkApiHealth = async () => {
      try {
        const response = await fetch('/api/health')
        const data = await response.json()
        setApiHealth(data)
      } catch (error) {
        setApiHealth({ status: 'error', message: error.message })
      } finally {
        setIsLoading(false)
      }
    }

    checkApiHealth()
    const interval = setInterval(checkApiHealth, 30000) // Check every 30s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <img 
                    src="/dailey-logo.png" 
                    alt="Dailey Media API" 
                    className="w-10 h-10 shadow-lg rounded-xl"
                  />
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                    Dailey Media API
                  </h1>
                  <div className="text-sm text-slate-500 font-medium">
                    Professional Media Processing & Storage
                  </div>
                </div>
              </div>
            </div>
          
            {/* API Status */}
            <div className="flex items-center space-x-3">
              {isLoading ? (
                <div className="flex items-center space-x-2 px-3 py-2 bg-slate-100 rounded-full">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  <span className="text-sm text-slate-600 font-medium">Checking API...</span>
                </div>
              ) : apiHealth?.status === 'healthy' ? (
                <div className="flex items-center space-x-2 px-3 py-2 bg-green-100 text-green-700 rounded-full">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">API Healthy</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded-full">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">API Error</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <Tabs.Root defaultValue="upload" className="w-full">
          {/* Tab Navigation */}
          <Tabs.List className="flex space-x-1 bg-white/60 backdrop-blur-sm p-1 rounded-xl border border-slate-200/60 shadow-sm">
            <Tabs.Trigger
              value="upload"
              className={cn(
                "flex items-center space-x-2 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
                "data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md data-[state=active]:scale-[1.02]",
                "data-[state=inactive]:text-slate-600 hover:text-slate-900 hover:bg-white/50"
              )}
            >
              <Upload className="h-4 w-4" />
              <span>Upload</span>
            </Tabs.Trigger>
            
            <Tabs.Trigger
              value="media"
              className={cn(
                "flex items-center space-x-2 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
                "data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md data-[state=active]:scale-[1.02]",
                "data-[state=inactive]:text-slate-600 hover:text-slate-900 hover:bg-white/50"
              )}
            >
              <FileImage className="h-4 w-4" />
              <span>Media</span>
            </Tabs.Trigger>
            
            <Tabs.Trigger
              value="docs"
              className={cn(
                "flex items-center space-x-2 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
                "data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md data-[state=active]:scale-[1.02]",
                "data-[state=inactive]:text-slate-600 hover:text-slate-900 hover:bg-white/50"
              )}
            >
              <BookOpen className="h-4 w-4" />
              <span>API Docs</span>
            </Tabs.Trigger>
            
            <Tabs.Trigger
              value="monitor"
              className={cn(
                "flex items-center space-x-2 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
                "data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md data-[state=active]:scale-[1.02]",
                "data-[state=inactive]:text-slate-600 hover:text-slate-900 hover:bg-white/50"
              )}
            >
              <Activity className="h-4 w-4" />
              <span>Monitor</span>
            </Tabs.Trigger>
          </Tabs.List>

          {/* Tab Content */}
          <div className="mt-8">
            <Tabs.Content value="upload" className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-8">
              <UploadTab />
            </Tabs.Content>
            
            <Tabs.Content value="media" className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-8">
              <MediaTab />
            </Tabs.Content>
            
            <Tabs.Content value="docs" className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-8">
              <DocsTab />
            </Tabs.Content>
            
            <Tabs.Content value="monitor" className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-8">
              <MonitorTab apiHealth={apiHealth} />
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </main>

      {/* Footer */}
      <footer className="mt-16 bg-white/40 backdrop-blur-sm border-t border-slate-200/60">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src="/dailey-logo.png" 
                alt="Dailey Media API" 
                className="w-8 h-8"
              />
              <div>
                <div className="font-semibold text-slate-900">Dailey Media API</div>
                <div className="text-sm text-slate-500">Professional media processing and storage solution</div>
              </div>
            </div>
            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-2 text-slate-600">
                <Info className="h-4 w-4" />
                <span>Tailscale Network</span>
                <code className="px-2 py-1 bg-slate-100 rounded text-xs">100.105.97.19</code>
              </div>
              <div className="text-slate-400">
                © 2024 Dailey Labs
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
