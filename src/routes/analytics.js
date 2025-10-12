import express from 'express'
import analyticsService from '../services/analyticsService.js'
import { authenticateToken, requireAnyRole } from '../middleware/dailey-auth.js'
import { logInfo, logError } from '../middleware/logger.js'

const router = express.Router()

// Get analytics data
router.get('/', 
  authenticateToken, 
  requireAnyRole(['core.admin', 'tenant.admin', 'analytics.viewer']), // Only admin roles can access analytics
  async (req, res) => {
    try {
      const { timeRange = '7d' } = req.query
      
      const validTimeRanges = ['24h', '7d', '30d', '90d', '1y']
      if (!validTimeRanges.includes(timeRange)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid time range. Must be one of: ' + validTimeRanges.join(', ')
        })
      }

      const analytics = await analyticsService.getAnalytics(timeRange)
      
      res.json({
        success: true,
        analytics,
        timeRange,
        generatedAt: new Date().toISOString()
      })
    } catch (error) {
      console.error('Analytics endpoint error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve analytics data'
      })
    }
  }
)

// Get real-time stats
router.get('/realtime',
  authenticateToken,
  requireAnyRole(['core.admin', 'tenant.admin', 'analytics.viewer']),
  async (req, res) => {
    try {
      const stats = await analyticsService.getStats()
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const currentHour = now.getHours()

      // Get today's stats
      const todayStats = stats.dailyStats[today] || {
        uploads: 0,
        accesses: 0,
        bandwidth: 0,
        uniqueUsers: [],
        uniqueEmails: [],
        hourlyAccesses: Array(24).fill(0)
      }

      // Get last hour's accesses
      const lastHourAccesses = todayStats.hourlyAccesses ? 
        todayStats.hourlyAccesses[currentHour] || 0 : 0

      res.json({
        success: true,
        realtime: {
          currentHour: {
            accesses: lastHourAccesses,
            hour: currentHour
          },
          today: {
            uploads: todayStats.uploads,
            accesses: todayStats.accesses,
            bandwidth: analyticsService.formatBytes(todayStats.bandwidth || 0),
            uniqueUsers: Array.isArray(todayStats.uniqueUsers) ? todayStats.uniqueUsers.length : 0
          },
          overall: {
            totalFiles: stats.overview.totalFiles || 0,
            totalAccesses: stats.overview.totalAccesses || 0,
            totalSize: analyticsService.formatBytes(stats.overview.totalSize || 0)
          }
        },
        timestamp: now.toISOString()
      })
    } catch (error) {
      console.error('Realtime analytics error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve realtime analytics'
      })
    }
  }
)

// Get top files with detailed stats
router.get('/files/top',
  authenticateToken,
  requireAnyRole(['core.admin', 'tenant.admin', 'analytics.viewer']),
  async (req, res) => {
    try {
      const { limit = 10 } = req.query
      const stats = await analyticsService.getStats()

      const topFiles = Object.entries(stats.fileAccesses)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, parseInt(limit))
        .map(([fileId, data]) => ({
          fileId,
          accesses: data.count,
          uniqueUsers: Array.isArray(data.users) ? data.users.length : 0,
          lastAccessed: data.lastAccessed,
          // Try to get additional file info if available
          filename: `file_${fileId.slice(-8)}.ext`, // Mock filename
          category: 'unknown'
        }))

      res.json({
        success: true,
        topFiles,
        total: Object.keys(stats.fileAccesses).length
      })
    } catch (error) {
      console.error('Top files analytics error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve top files analytics'
      })
    }
  }
)

// Export analytics data
router.get('/export',
  authenticateToken,
  requireAnyRole(['core.admin', 'tenant.admin', 'analytics.viewer']),
  async (req, res) => {
    try {
      const { format = 'json', timeRange = '30d' } = req.query
      
      if (!['json', 'csv'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Must be json or csv'
        })
      }

      const analytics = await analyticsService.getAnalytics(timeRange)
      
      if (format === 'csv') {
        // Convert to CSV format
        let csv = 'Date,Uploads,Accesses,Bandwidth,Unique Users\n'
        
        // Add daily data to CSV
        Object.entries(analytics.dailyStats || {}).forEach(([date, stats]) => {
          const uniqueUsers = Array.isArray(stats.uniqueUsers) ? stats.uniqueUsers.length : 0
          const bandwidth = stats.bandwidth || 0
          csv += `${date},${stats.uploads || 0},${stats.accesses || 0},${bandwidth},${uniqueUsers}\n`
        })

        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', `attachment; filename=analytics_${timeRange}_${Date.now()}.csv`)
        res.send(csv)
      } else {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-Disposition', `attachment; filename=analytics_${timeRange}_${Date.now()}.json`)
        res.json({
          success: true,
          analytics,
          exportedAt: new Date().toISOString(),
          timeRange
        })
      }
    } catch (error) {
      console.error('Export analytics error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to export analytics data'
      })
    }
  }
)

export default router
