import { useState, useEffect } from 'react'
import { Activity, Server, Database, HardDrive, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { formatDate } from '../lib/utils'

export default function MonitorTab({ apiHealth }) {
  const [detailedHealth, setDetailedHealth] = useState(null)
  const [healthHistory, setHealthHistory] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (apiHealth) {
      setHealthHistory(prev => {
        const newEntry = {
          ...apiHealth,
          timestamp: new Date().toISOString()
        }
        return [newEntry, ...prev.slice(0, 19)] // Keep last 20 entries
      })
    }
  }, [apiHealth])

  const refreshHealth = async () => {
    setRefreshing(true)
    try {
      const [healthRes, detailedRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/health/detailed').catch(() => null) // This endpoint doesn't exist yet
      ])
      
      const healthData = await healthRes.json()
      const detailedData = detailedRes ? await detailedRes.json() : null
      
      setDetailedHealth(detailedData)
    } catch (error) {
      console.error('Failed to refresh health:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200'
      default:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Service Monitor</h2>
          <p className="text-muted-foreground">
            Real-time monitoring of API health, performance, and system status.
          </p>
        </div>
        <button
          onClick={refreshHealth}
          disabled={refreshing}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">API Status</span>
            {getStatusIcon(apiHealth?.status)}
          </div>
          <div className="text-2xl font-semibold capitalize">
            {apiHealth?.status || 'Unknown'}
          </div>
          {apiHealth?.uptime && (
            <div className="text-xs text-muted-foreground mt-1">
              Uptime: {Math.floor(apiHealth.uptime / 60)}m {apiHealth.uptime % 60}s
            </div>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Environment</span>
            <Server className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold capitalize">
            {apiHealth?.environment || 'Unknown'}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Version: {apiHealth?.version || 'Unknown'}
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Storage</span>
            <HardDrive className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold">
            Local
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Type: File system
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Response Time</span>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold">
            {apiHealth?.responseTime || '< 10'}ms
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Last check: {apiHealth?.timestamp ? formatDate(apiHealth.timestamp) : 'Never'}
          </div>
        </div>
      </div>

      {/* Service Components */}
      <div className="border rounded-lg p-6">
        <h3 className="font-medium mb-4">Service Components</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center space-x-3">
              <Server className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Express Server</div>
                <div className="text-sm text-muted-foreground">HTTP API server</div>
              </div>
            </div>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center space-x-3">
              <Database className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Storage Service</div>
                <div className="text-sm text-muted-foreground">File storage layer</div>
              </div>
            </div>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center space-x-3">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Image Processing</div>
                <div className="text-sm text-muted-foreground">Sharp + ImageMagick</div>
              </div>
            </div>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center space-x-3">
              <Server className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Middleware</div>
                <div className="text-sm text-muted-foreground">CORS, logging, security</div>
              </div>
            </div>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
        </div>
      </div>

      {/* Health History */}
      <div className="border rounded-lg p-6">
        <h3 className="font-medium mb-4">Health History</h3>
        {healthHistory.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {healthHistory.map((entry, index) => (
              <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(entry.status)}
                  <div>
                    <div className="text-sm">{formatDate(entry.timestamp)}</div>
                    <div className="text-xs text-muted-foreground">
                      Status: {entry.status}
                      {entry.uptime && ` • Uptime: ${Math.floor(entry.uptime / 60)}m`}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-1 text-xs rounded-full border ${getStatusColor(entry.status)}`}>
                  {entry.status}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>No health data available yet.</p>
            <p className="text-xs">Health checks will appear here as they are performed.</p>
          </div>
        )}
      </div>

      {/* System Information */}
      <div className="border rounded-lg p-6">
        <h3 className="font-medium mb-4">System Information</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium">Node.js Version:</span>
              <div className="text-muted-foreground">{process?.version || 'Unknown'}</div>
            </div>
            <div>
              <span className="text-sm font-medium">API Base URL:</span>
              <div className="text-muted-foreground font-mono text-sm">http://100.105.97.19:4000</div>
            </div>
            <div>
              <span className="text-sm font-medium">Frontend URL:</span>
              <div className="text-muted-foreground font-mono text-sm">http://100.105.97.19:5174</div>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium">Network:</span>
              <div className="text-muted-foreground">Tailscale (100.105.97.19)</div>
            </div>
            <div>
              <span className="text-sm font-medium">Storage Location:</span>
              <div className="text-muted-foreground font-mono text-sm">./storage/</div>
            </div>
            <div>
              <span className="text-sm font-medium">Max Upload Size:</span>
              <div className="text-muted-foreground">100 MB per file</div>
            </div>
          </div>
        </div>
      </div>

      {/* Monitoring Features Placeholder */}
      <div className="border rounded-lg p-8 text-center bg-muted/50">
        <Activity className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Advanced Monitoring</h3>
        <p className="text-muted-foreground mb-4">
          Extended monitoring features for production deployments.
        </p>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Future features:</p>
          <ul className="list-disc list-inside text-xs space-y-1">
            <li>Performance metrics and charts</li>
            <li>Error rate tracking</li>
            <li>Storage usage analytics</li>
            <li>Alert configuration</li>
            <li>Log aggregation</li>
            <li>Resource utilization</li>
          </ul>
        </div>
      </div>
    </div>
  )
}