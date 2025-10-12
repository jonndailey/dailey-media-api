import { promises as fs } from 'fs'
import path from 'path'

class AnalyticsService {
  constructor() {
    this.statsFile = path.join(process.cwd(), 'data', 'analytics.json')
    this.ensureDataDirectory()
  }

  async ensureDataDirectory() {
    const dataDir = path.dirname(this.statsFile)
    try {
      await fs.mkdir(dataDir, { recursive: true })
    } catch (error) {
      console.error('Failed to create data directory:', error)
    }
  }

  ensureArray(value) {
    if (!value) return []
    if (Array.isArray(value)) return Array.from(new Set(value))
    if (value instanceof Set) return Array.from(value)
    if (typeof value === 'object') {
      return Array.from(new Set(Object.values(value).filter(Boolean)))
    }
    return [value]
  }

  addUnique(array, value) {
    if (!value) return
    if (!Array.isArray(array)) {
      throw new Error('addUnique expects an array reference')
    }
    if (!array.includes(value)) {
      array.push(value)
    }
  }

  ensureHourlyArray(values = []) {
    const hourly = Array.isArray(values) ? [...values] : []
    while (hourly.length < 24) {
      hourly.push(0)
    }
    return hourly.slice(0, 24).map(value => Number(value || 0))
  }

  normalizeStatsStructure(stats = {}) {
    const defaults = this.getDefaultStats()

    const normalized = {
      overview: {
        ...defaults.overview,
        ...(stats.overview || {})
      },
      fileAccesses: {},
      userAccesses: {},
      dailyStats: {},
      fileTypes: { ...defaults.fileTypes },
      performance: {
        responseTimes: Array.isArray(stats.performance?.responseTimes) ? stats.performance.responseTimes : [],
        errorCount: Number(stats.performance?.errorCount || 0),
        requestCount: Number(stats.performance?.requestCount || 0)
      }
    }

    Object.entries(stats.fileTypes || {}).forEach(([category, data]) => {
      normalized.fileTypes[category] = {
        count: Number(data?.count || 0),
        size: Number(data?.size || 0)
      }
    })

    Object.entries(stats.fileAccesses || {}).forEach(([fileId, data = {}]) => {
      normalized.fileAccesses[fileId] = {
        count: Number(data.count || 0),
        lastAccessed: data.lastAccessed || null,
        users: this.ensureArray(data.users),
        emails: this.ensureArray(data.emails)
      }
    })

    Object.entries(stats.userAccesses || {}).forEach(([userId, data = {}]) => {
      normalized.userAccesses[userId] = {
        totalAccesses: Number(data.totalAccesses || 0),
        filesAccessed: this.ensureArray(data.filesAccessed),
        lastSeen: data.lastSeen || null,
        userAgent: data.userAgent || '',
        ip: data.ip || '',
        email: data.email || null,
        roles: this.ensureArray(data.roles)
      }
    })

    Object.entries(stats.dailyStats || {}).forEach(([date, data = {}]) => {
      normalized.dailyStats[date] = {
        uploads: Number(data.uploads || 0),
        accesses: Number(data.accesses || 0),
        bandwidth: Number(data.bandwidth || 0),
        uniqueUsers: this.ensureArray(data.uniqueUsers),
        uniqueEmails: this.ensureArray(data.uniqueEmails),
        hourlyAccesses: this.ensureHourlyArray(data.hourlyAccesses)
      }
    })

    normalized.performance.responseTimes = normalized.performance.responseTimes
      .filter(entry => entry && typeof entry === 'object' && typeof entry.time === 'number' && entry.timestamp)
      .map(entry => ({
        time: Number(entry.time),
        timestamp: entry.timestamp
      }))

    normalized.overview.totalFiles = Number(normalized.overview.totalFiles || 0)
    normalized.overview.totalSize = Number(normalized.overview.totalSize || 0)
    normalized.overview.totalAccesses = Number(normalized.overview.totalAccesses || 0)
    normalized.overview.uniqueUsers = Number(normalized.overview.uniqueUsers || 0)

    return normalized
  }

  async getStats() {
    try {
      const data = await fs.readFile(this.statsFile, 'utf8')
      return this.normalizeStatsStructure(JSON.parse(data))
    } catch (error) {
      // Return default stats if file doesn't exist
      return this.getDefaultStats()
    }
  }

  async updateStats(updatedStats) {
    try {
      const normalized = this.normalizeStatsStructure(updatedStats)
      await fs.writeFile(this.statsFile, JSON.stringify(normalized, null, 2))
      return normalized
    } catch (error) {
      console.error('Failed to update stats:', error)
      throw error
    }
  }

  getDefaultStats() {
    return {
      overview: {
        totalFiles: 0,
        totalSize: 0,
        totalAccesses: 0,
        uniqueUsers: 0,
        lastUpdated: new Date().toISOString()
      },
      fileAccesses: {},
      userAccesses: {},
      dailyStats: {},
      fileTypes: {
        images: { count: 0, size: 0 },
        documents: { count: 0, size: 0 },
        videos: { count: 0, size: 0 },
        audio: { count: 0, size: 0 },
        archives: { count: 0, size: 0 },
        code: { count: 0, size: 0 },
        data: { count: 0, size: 0 },
        other: { count: 0, size: 0 }
      },
      performance: {
        responseTimes: [],
        errorCount: 0,
        requestCount: 0
      }
    }
  }

  async trackFileUpload(fileData, userContext = {}) {
    try {
      const stats = await this.getStats()
      const today = new Date().toISOString().split('T')[0]
      
      // Update overview
      stats.overview.totalFiles += 1
      stats.overview.totalSize += fileData.size
      stats.overview.lastUpdated = new Date().toISOString()

      // Update daily stats
      const todayStats = stats.dailyStats[today] || {
        uploads: 0,
        accesses: 0,
        bandwidth: 0,
        uniqueUsers: [],
        uniqueEmails: [],
        hourlyAccesses: Array(24).fill(0)
      }
      todayStats.uploads += 1
      todayStats.uniqueUsers = this.ensureArray(todayStats.uniqueUsers)
      todayStats.uniqueEmails = this.ensureArray(todayStats.uniqueEmails)

      // Track user info if available
      if (userContext.userId) {
        this.addUnique(todayStats.uniqueUsers, userContext.userId)
      }
      if (userContext.email) {
        this.addUnique(todayStats.uniqueEmails, userContext.email)
      }

      stats.dailyStats[today] = todayStats

      // Update file type stats
      const category = fileData.category || 'other'
      if (stats.fileTypes[category]) {
        stats.fileTypes[category].count += 1
        stats.fileTypes[category].size += fileData.size
      }

      await this.updateStats(stats)
      return stats
    } catch (error) {
      console.error('Failed to track file upload:', error)
    }
  }

  async trackFileAccess(fileId, userContext = {}) {
    try {
      const stats = await this.getStats()
      const today = new Date().toISOString().split('T')[0]
      const hour = new Date().getHours()

      // Update overview
      stats.overview.totalAccesses += 1
      stats.overview.lastUpdated = new Date().toISOString()

      // Extract user info from context
      const userId = userContext.userId || userContext.user?.id || 'anonymous'
      const userEmail = userContext.email || userContext.user?.email
      const userAgent = userContext.userAgent || ''
      const ip = userContext.ip || ''

      // Track file access
      const fileAccessEntry = stats.fileAccesses[fileId] || {
        count: 0,
        lastAccessed: null,
        users: [],
        emails: []
      }
      fileAccessEntry.count += 1
      fileAccessEntry.lastAccessed = new Date().toISOString()
      fileAccessEntry.users = this.ensureArray(fileAccessEntry.users)
      this.addUnique(fileAccessEntry.users, userId)
      if (userEmail) {
        fileAccessEntry.emails = this.ensureArray(fileAccessEntry.emails)
        this.addUnique(fileAccessEntry.emails, userEmail)
      }
      stats.fileAccesses[fileId] = fileAccessEntry

      // Track user access
      const userAccessEntry = stats.userAccesses[userId] || {
        totalAccesses: 0,
        filesAccessed: [],
        lastSeen: null,
        userAgent,
        ip,
        email: userEmail || null,
        roles: []
      }
      userAccessEntry.totalAccesses += 1
      userAccessEntry.filesAccessed = this.ensureArray(userAccessEntry.filesAccessed)
      this.addUnique(userAccessEntry.filesAccessed, fileId)
      userAccessEntry.lastSeen = new Date().toISOString()
      
      // Update user info if available
      if (userEmail && !userAccessEntry.email) {
        userAccessEntry.email = userEmail
      }
      if (userContext.roles && userContext.roles.length > 0) {
        const existingRoles = this.ensureArray(userAccessEntry.roles)
        userAccessEntry.roles = Array.from(new Set([...existingRoles, ...userContext.roles]))
      }
      if (userAgent) {
        userAccessEntry.userAgent = userAgent
      }
      if (ip) {
        userAccessEntry.ip = ip
      }
      stats.userAccesses[userId] = userAccessEntry

      // Update daily stats
      const todayStats = stats.dailyStats[today] || {
        uploads: 0,
        accesses: 0,
        bandwidth: 0,
        uniqueUsers: [],
        uniqueEmails: [],
        hourlyAccesses: Array(24).fill(0)
      }
      todayStats.accesses += 1
      todayStats.uniqueUsers = this.ensureArray(todayStats.uniqueUsers)
      todayStats.uniqueEmails = this.ensureArray(todayStats.uniqueEmails)
      this.addUnique(todayStats.uniqueUsers, userId)
      if (userEmail) {
        this.addUnique(todayStats.uniqueEmails, userEmail)
      }
      todayStats.hourlyAccesses = this.ensureHourlyArray(todayStats.hourlyAccesses)
      todayStats.hourlyAccesses[hour] = (todayStats.hourlyAccesses[hour] || 0) + 1
      stats.dailyStats[today] = todayStats

      // Update unique users count
      stats.overview.uniqueUsers = Object.keys(stats.userAccesses).length

      await this.updateStats(stats)
      return stats
    } catch (error) {
      console.error('Failed to track file access:', error)
    }
  }

  async trackBandwidth(fileId, bytes, userContext = {}) {
    try {
      const stats = await this.getStats()
      const today = new Date().toISOString().split('T')[0]

      // Update daily bandwidth
      const todayStats = stats.dailyStats[today] || {
        uploads: 0,
        accesses: 0,
        bandwidth: 0,
        uniqueUsers: [],
        uniqueEmails: [],
        hourlyAccesses: Array(24).fill(0)
      }
      todayStats.bandwidth += bytes
      stats.dailyStats[today] = todayStats

      await this.updateStats(stats)
      return stats
    } catch (error) {
      console.error('Failed to track bandwidth:', error)
    }
  }

  async trackPerformance(responseTime, isError = false) {
    try {
      const stats = await this.getStats()
      
      // Track response time
      stats.performance.responseTimes.push({
        time: responseTime,
        timestamp: new Date().toISOString()
      })

      // Keep only last 1000 response times
      if (stats.performance.responseTimes.length > 1000) {
        stats.performance.responseTimes = stats.performance.responseTimes.slice(-1000)
      }

      // Track errors and requests
      stats.performance.requestCount += 1
      if (isError) {
        stats.performance.errorCount += 1
      }

      await this.updateStats(stats)
      return stats
    } catch (error) {
      console.error('Failed to track performance:', error)
    }
  }

  async getAnalytics(timeRange = '7d') {
    try {
      const stats = await this.getStats()
      const now = new Date()
      let startDate

      // Calculate start date based on time range
      switch (timeRange) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        case '1y':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      }

      // Filter daily stats by time range
      const filteredDailyStats = {}
      Object.keys(stats.dailyStats).forEach(date => {
        const dateObj = new Date(date)
        if (dateObj >= startDate) {
          filteredDailyStats[date] = stats.dailyStats[date]
        }
      })

      // Calculate trends
      const dates = Object.keys(filteredDailyStats).sort()
      const midPoint = Math.floor(dates.length / 2)
      const firstHalf = dates.slice(0, midPoint)
      const secondHalf = dates.slice(midPoint)

      const firstHalfStats = this.aggregateStats(firstHalf, filteredDailyStats)
      const secondHalfStats = this.aggregateStats(secondHalf, filteredDailyStats)

      const trends = {
        filesUploaded: this.calculateChange(secondHalfStats.uploads, firstHalfStats.uploads),
        fileAccesses: this.calculateChange(secondHalfStats.accesses, firstHalfStats.accesses),
        bandwidth: this.calculateChange(secondHalfStats.bandwidth, firstHalfStats.bandwidth),
        apiCalls: this.calculateChange(secondHalfStats.accesses + secondHalfStats.uploads, firstHalfStats.accesses + firstHalfStats.uploads)
      }

      trends.bandwidth = {
        current: this.formatBytes(trends.bandwidth.current || 0),
        previous: this.formatBytes(trends.bandwidth.previous || 0),
        change: trends.bandwidth.change
      }

      // Get top files
      const topFiles = Object.entries(stats.fileAccesses)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, 5)
        .map(([fileId, data]) => ({
          fileId,
          accesses: data.count,
          lastAccessed: data.lastAccessed,
          uniqueUsers: this.ensureArray(data.users).length,
          uniqueEmails: this.ensureArray(data.emails).length
        }))

      // Calculate performance metrics
      const recentResponseTimes = stats.performance.responseTimes
        .filter(rt => new Date(rt.timestamp) >= startDate)
        .map(rt => rt.time)

      const avgResponseTime = recentResponseTimes.length > 0
        ? Math.round(recentResponseTimes.reduce((sum, time) => sum + time, 0) / recentResponseTimes.length)
        : 0

      const errorRate = stats.performance.requestCount > 0
        ? ((stats.performance.errorCount / stats.performance.requestCount) * 100).toFixed(2)
        : 0

      return {
        overview: {
          ...stats.overview,
          totalSize: this.formatBytes(stats.overview.totalSize),
          avgResponseTime: `${avgResponseTime}ms`,
          uptime: '99.9%' // Mock uptime for now
        },
        trends,
        fileTypes: Object.entries(stats.fileTypes).map(([category, data]) => ({
          category: category.charAt(0).toUpperCase() + category.slice(1),
          count: data.count,
          size: this.formatBytes(data.size),
          percentage: stats.overview.totalFiles > 0 ? ((data.count / stats.overview.totalFiles) * 100).toFixed(1) : 0
        })).filter(type => type.count > 0),
        topFiles,
        accessPatterns: {
          hourly: this.getHourlyPattern(filteredDailyStats),
          devices: this.getDeviceBreakdown(stats.userAccesses),
          regions: this.getRegionBreakdown() // Mock for now
        },
        performance: {
          responseTime: this.getResponseTimeHistory(stats.performance.responseTimes, startDate),
          errorRate: parseFloat(errorRate),
          cacheHitRate: 94.7 // Mock for now
        }
      }
    } catch (error) {
      console.error('Failed to get analytics:', error)
      throw error
    }
  }

  aggregateStats(dates, dailyStats) {
    return dates.reduce((acc, date) => {
      const dayStats = dailyStats[date] || { uploads: 0, accesses: 0, bandwidth: 0 }
      acc.uploads += dayStats.uploads || 0
      acc.accesses += dayStats.accesses || 0
      acc.bandwidth += dayStats.bandwidth || 0
      return acc
    }, { uploads: 0, accesses: 0, bandwidth: 0 })
  }

  calculateChange(current, previous) {
    if (previous === 0) return { current, previous, change: 0 }
    const change = ((current - previous) / previous) * 100
    return { current, previous, change: Math.round(change * 10) / 10 }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  getHourlyPattern(dailyStats) {
    const hourlyTotals = Array(24).fill(0)
    Object.values(dailyStats).forEach(day => {
      if (day.hourlyAccesses) {
        day.hourlyAccesses.forEach((count, hour) => {
          hourlyTotals[hour] += count || 0
        })
      }
    })
    return hourlyTotals.map((accesses, hour) => ({ hour, accesses }))
  }

  getDeviceBreakdown(userAccesses) {
    const counts = {
      Desktop: 0,
      Mobile: 0,
      API: 0
    }

    const entries = Object.values(userAccesses || {})
    entries.forEach(entry => {
      const agent = (entry?.userAgent || '').toLowerCase()
      if (!agent || agent.includes('axios') || agent.includes('http')) {
        counts.API += 1
      } else if (agent.includes('mobile') || agent.includes('iphone') || agent.includes('android') || agent.includes('ipad')) {
        counts.Mobile += 1
      } else {
        counts.Desktop += 1
      }
    })

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    if (total === 0) {
      return []
    }

    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([type, value]) => ({
        type,
        percentage: Math.round((value / total) * 1000) / 10
      }))
  }

  getRegionBreakdown() {
    return []
  }

  getResponseTimeHistory(responseTimes, startDate) {
    const dailyAverages = {}
    responseTimes
      .filter(rt => new Date(rt.timestamp) >= startDate)
      .forEach(rt => {
        const date = rt.timestamp.split('T')[0]
        if (!dailyAverages[date]) {
          dailyAverages[date] = { total: 0, count: 0 }
        }
        dailyAverages[date].total += rt.time
        dailyAverages[date].count += 1
      })

    return Object.entries(dailyAverages).map(([date, data]) => ({
      date: new Date(date).toLocaleDateString(),
      avgTime: Math.round(data.total / data.count),
      p95Time: Math.round((data.total / data.count) * 1.5) // Mock P95
    }))
  }
}

export default new AnalyticsService()
