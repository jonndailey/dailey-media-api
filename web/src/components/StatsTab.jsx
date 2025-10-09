import { useState, useEffect } from 'react'
import { 
  TrendingUp,
  Download,
  Eye,
  Clock,
  Users,
  FileText,
  BarChart3,
  Calendar,
  Globe,
  Smartphone,
  Monitor,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Activity
} from 'lucide-react'

export default function StatsTab() {
  const [stats, setStats] = useState(null)
  const [timeRange, setTimeRange] = useState('7d')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const timeRanges = [
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: '1y', label: 'Last Year' }
  ]

  useEffect(() => {
    fetchStats()
  }, [timeRange])

  const fetchStats = async () => {
    setLoading(true)
    try {
      // Mock data for now - replace with actual API call
      const mockStats = {
        overview: {
          totalFiles: 1247,
          totalSize: '15.3 GB',
          totalAccesses: 8923,
          uniqueUsers: 342,
          avgResponseTime: '127ms',
          uptime: '99.9%'
        },
        trends: {
          filesUploaded: { current: 89, previous: 73, change: 21.9 },
          fileAccesses: { current: 2341, previous: 1987, change: 17.8 },
          bandwidth: { current: '2.1 GB', previous: '1.8 GB', change: 16.7 },
          apiCalls: { current: 15672, previous: 13201, change: 18.7 }
        },
        fileTypes: [
          { category: 'Images', count: 523, size: '8.2 GB', percentage: 53.6 },
          { category: 'Documents', count: 298, size: '3.1 GB', percentage: 20.2 },
          { category: 'Videos', count: 156, size: '2.8 GB', percentage: 18.3 },
          { category: 'Archives', count: 134, size: '890 MB', percentage: 5.8 },
          { category: 'Audio', count: 89, size: '234 MB', percentage: 1.5 },
          { category: 'Code', count: 47, size: '12 MB', percentage: 0.6 }
        ],
        topFiles: [
          { filename: 'company-logo.png', accesses: 234, bandwidth: '45 MB', category: 'Images' },
          { filename: 'annual-report-2024.pdf', accesses: 198, bandwidth: '89 MB', category: 'Documents' },
          { filename: 'product-demo.mp4', accesses: 156, bandwidth: '312 MB', category: 'Videos' },
          { filename: 'api-documentation.pdf', accesses: 134, bandwidth: '23 MB', category: 'Documents' },
          { filename: 'user-avatars.zip', accesses: 89, bandwidth: '156 MB', category: 'Archives' }
        ],
        accessPatterns: {
          hourly: Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            accesses: Math.floor(Math.random() * 100) + 20
          })),
          devices: [
            { type: 'Desktop', percentage: 45.2, icon: Monitor },
            { type: 'Mobile', percentage: 32.8, icon: Smartphone },
            { type: 'API', percentage: 22.0, icon: Globe }
          ],
          regions: [
            { region: 'North America', percentage: 52.3, accesses: 4672 },
            { region: 'Europe', percentage: 28.9, accesses: 2581 },
            { region: 'Asia Pacific', percentage: 14.2, accesses: 1267 },
            { region: 'Other', percentage: 4.6, accesses: 403 }
          ]
        },
        performance: {
          responseTime: Array.from({ length: 30 }, (_, i) => ({
            date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
            avgTime: Math.floor(Math.random() * 50) + 100,
            p95Time: Math.floor(Math.random() * 100) + 200
          })),
          errorRate: 0.12,
          cacheHitRate: 94.7
        }
      }

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setStats(mockStats)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatChange = (change) => {
    const isPositive = change > 0
    const color = isPositive ? 'text-green-600' : 'text-red-600'
    const icon = isPositive ? ArrowUp : ArrowDown
    const Icon = icon
    
    return (
      <div className={`flex items-center space-x-1 ${color}`}>
        <Icon className="h-3 w-3" />
        <span className="text-sm font-medium">{Math.abs(change).toFixed(1)}%</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          <span className="text-slate-600">Loading analytics...</span>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">Failed to load analytics data</p>
          <button 
            onClick={fetchStats}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Analytics & Usage Stats</h2>
          <p className="text-slate-600 mt-1">Monitor file access patterns, performance metrics, and usage trends</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {timeRanges.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
          
          <button
            onClick={fetchStats}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Last updated: {lastUpdated.toLocaleString()}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Files</p>
              <p className="text-2xl font-bold text-slate-900">{stats.overview.totalFiles.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-slate-600">Storage Used</span>
            <span className="text-sm font-medium text-slate-900">{stats.overview.totalSize}</span>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Accesses</p>
              <p className="text-2xl font-bold text-slate-900">{stats.overview.totalAccesses.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Eye className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-slate-600">Unique Users</span>
            <span className="text-sm font-medium text-slate-900">{stats.overview.uniqueUsers}</span>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Avg Response Time</p>
              <p className="text-2xl font-bold text-slate-900">{stats.overview.avgResponseTime}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-slate-600">Uptime</span>
            <span className="text-sm font-medium text-green-700">{stats.overview.uptime}</span>
          </div>
        </div>
      </div>

      {/* Trends */}
      <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
          <TrendingUp className="h-5 w-5 mr-2" />
          Trends ({timeRanges.find(r => r.value === timeRange)?.label})
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Files Uploaded</span>
              {formatChange(stats.trends.filesUploaded.change)}
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.trends.filesUploaded.current}</p>
            <p className="text-xs text-slate-500">Previous: {stats.trends.filesUploaded.previous}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">File Accesses</span>
              {formatChange(stats.trends.fileAccesses.change)}
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.trends.fileAccesses.current.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Previous: {stats.trends.fileAccesses.previous.toLocaleString()}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Bandwidth</span>
              {formatChange(stats.trends.bandwidth.change)}
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.trends.bandwidth.current}</p>
            <p className="text-xs text-slate-500">Previous: {stats.trends.bandwidth.previous}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">API Calls</span>
              {formatChange(stats.trends.apiCalls.change)}
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.trends.apiCalls.current.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Previous: {stats.trends.apiCalls.previous.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File Types Distribution */}
        <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2" />
            File Types Distribution
          </h3>
          
          <div className="space-y-3">
            {stats.fileTypes.map((type) => (
              <div key={type.category} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-900">{type.category}</span>
                    <span className="text-sm text-slate-600">{type.count} files</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full" 
                      style={{ width: `${type.percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-500">{type.size}</span>
                    <span className="text-xs text-slate-500">{type.percentage}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Files */}
        <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <Download className="h-5 w-5 mr-2" />
            Most Accessed Files
          </h3>
          
          <div className="space-y-3">
            {stats.topFiles.map((file, index) => (
              <div key={file.filename} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{file.filename}</p>
                  <p className="text-xs text-slate-500">{file.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{file.accesses} views</p>
                  <p className="text-xs text-slate-500">{file.bandwidth}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Access Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Types */}
        <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Access by Device Type
          </h3>
          
          <div className="space-y-4">
            {stats.accessPatterns.devices.map((device) => {
              const Icon = device.icon
              return (
                <div key={device.type} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Icon className="h-5 w-5 text-slate-600" />
                    </div>
                    <span className="font-medium text-slate-900">{device.type}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">{device.percentage}%</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Regional Distribution */}
        <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <Globe className="h-5 w-5 mr-2" />
            Access by Region
          </h3>
          
          <div className="space-y-3">
            {stats.accessPatterns.regions.map((region) => (
              <div key={region.region} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-900">{region.region}</span>
                    <span className="text-sm text-slate-600">{region.accesses.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full" 
                      style={{ width: `${region.percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-500">{region.percentage}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
          <Activity className="h-5 w-5 mr-2" />
          Performance Metrics
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600">Error Rate</p>
            <p className="text-2xl font-bold text-slate-900">{stats.performance.errorRate}%</p>
            <p className="text-xs text-green-600">Within normal range</p>
          </div>
          
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600">Cache Hit Rate</p>
            <p className="text-2xl font-bold text-slate-900">{stats.performance.cacheHitRate}%</p>
            <p className="text-xs text-green-600">Excellent performance</p>
          </div>
          
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600">Avg Response Time</p>
            <p className="text-2xl font-bold text-slate-900">{stats.overview.avgResponseTime}</p>
            <p className="text-xs text-green-600">Fast response</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Response Time Trend (Last 30 days)</p>
          <div className="h-32 bg-slate-50 rounded-lg flex items-end justify-center p-4">
            <div className="flex items-end space-x-1 h-full">
              {stats.performance.responseTime.slice(-14).map((point, index) => (
                <div
                  key={index}
                  className="bg-blue-500 rounded-t"
                  style={{
                    height: `${(point.avgTime / 300) * 100}%`,
                    width: '12px'
                  }}
                  title={`${point.date}: ${point.avgTime}ms`}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 text-center">
            Hover over bars to see daily response times
          </p>
        </div>
      </div>
    </div>
  )
}