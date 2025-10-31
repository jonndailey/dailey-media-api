#!/usr/bin/env node

/**
 * Analytics Report Generator
 * Combines application tracking and OVH logs for comprehensive analytics
 */

import databaseService from '../src/services/databaseService.js';
import { format } from 'date-fns';

class AnalyticsReporter {
  async initialize() {
    await databaseService.initialize();
  }

  async generateReport(days = 7) {
    console.log('\n' + '='.repeat(60));
    console.log(`📊 DMAPI Analytics Report - Last ${days} Days`);
    console.log('='.repeat(60));
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Overall statistics
    const overview = await this.getOverview(startDate);
    console.log('\n📈 Overview:');
    console.log(`  Total Requests: ${overview.total_requests.toLocaleString()}`);
    console.log(`  Unique Users: ${overview.unique_users}`);
    console.log(`  Unique IPs: ${overview.unique_ips}`);
    console.log(`  Total Bandwidth: ${this.formatBytes(overview.total_bandwidth)}`);
    console.log(`  Estimated Cost: $${overview.estimated_cost.toFixed(2)}`);
    
    // By application
    const byApp = await this.getByApplication(startDate);
    console.log('\n🎯 By Application:');
    byApp.forEach(app => {
      console.log(`  ${app.application_id || 'Unknown'}:`);
      console.log(`    Requests: ${app.requests.toLocaleString()}`);
      console.log(`    Bandwidth: ${this.formatBytes(app.bandwidth)}`);
      console.log(`    Users: ${app.unique_users}`);
    });
    
    // Top files
    const topFiles = await this.getTopFiles(startDate, 10);
    console.log('\n🔥 Top Files by Access:');
    topFiles.forEach((file, i) => {
      console.log(`  ${i + 1}. ${file.filename}`);
      console.log(`     Accesses: ${file.access_count}, Bandwidth: ${this.formatBytes(file.bandwidth)}`);
    });
    
    // Hourly pattern
    const hourlyPattern = await this.getHourlyPattern(startDate);
    console.log('\n🕐 Peak Hours (UTC):');
    const peakHours = hourlyPattern
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 3);
    peakHours.forEach(hour => {
      console.log(`  ${hour.hour}:00 - ${hour.requests} requests`);
    });
    
    // Error analysis
    const errors = await this.getErrorAnalysis(startDate);
    if (errors.error_count > 0) {
      console.log('\n⚠️ Errors:');
      console.log(`  Total Errors: ${errors.error_count}`);
      console.log(`  Error Rate: ${errors.error_rate.toFixed(2)}%`);
    }
    
    // Geographic distribution (if IP geolocation is set up)
    const geographic = await this.getGeographicDistribution(startDate);
    if (geographic.length > 0) {
      console.log('\n🌍 Top Locations:');
      geographic.slice(0, 5).forEach(loc => {
        console.log(`  ${loc.country || 'Unknown'}: ${loc.requests} requests`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Report generated at:', new Date().toISOString());
    console.log('='.repeat(60) + '\n');
  }

  async getOverview(startDate) {
    const result = await databaseService.query(`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT ip_address) as unique_ips,
        COALESCE(SUM(CAST(JSON_EXTRACT(metadata, '$.bytes') AS UNSIGNED)), 0) as total_bandwidth,
        ROUND(COALESCE(SUM(CAST(JSON_EXTRACT(metadata, '$.bytes') AS UNSIGNED)), 0) / 1073741824 * 0.011, 2) as estimated_cost
      FROM media_analytics
      WHERE timestamp >= ?
    `, [startDate]);
    
    return result[0];
  }

  async getByApplication(startDate) {
    return await databaseService.query(`
      SELECT 
        COALESCE(application_id, 'direct') as application_id,
        COUNT(*) as requests,
        COUNT(DISTINCT user_id) as unique_users,
        COALESCE(SUM(CAST(JSON_EXTRACT(metadata, '$.bytes') AS UNSIGNED)), 0) as bandwidth
      FROM media_analytics
      WHERE timestamp >= ?
      GROUP BY application_id
      ORDER BY requests DESC
    `, [startDate]);
  }

  async getTopFiles(startDate, limit = 10) {
    return await databaseService.query(`
      SELECT 
        mf.original_filename as filename,
        COUNT(*) as access_count,
        COUNT(DISTINCT ma.user_id) as unique_users,
        COALESCE(SUM(CAST(JSON_EXTRACT(ma.metadata, '$.bytes') AS UNSIGNED)), 0) as bandwidth
      FROM media_analytics ma
      JOIN media_files mf ON ma.media_file_id = mf.id
      WHERE ma.timestamp >= ?
      GROUP BY mf.id
      ORDER BY access_count DESC
      LIMIT ?
    `, [startDate, limit]);
  }

  async getHourlyPattern(startDate) {
    return await databaseService.query(`
      SELECT 
        HOUR(timestamp) as hour,
        COUNT(*) as requests
      FROM media_analytics
      WHERE timestamp >= ?
      GROUP BY HOUR(timestamp)
      ORDER BY hour
    `, [startDate]);
  }

  async getErrorAnalysis(startDate) {
    const result = await databaseService.query(`
      SELECT 
        SUM(CASE WHEN CAST(JSON_EXTRACT(metadata, '$.status') AS UNSIGNED) >= 400 THEN 1 ELSE 0 END) as error_count,
        COUNT(*) as total_count,
        (SUM(CASE WHEN CAST(JSON_EXTRACT(metadata, '$.status') AS UNSIGNED) >= 400 THEN 1 ELSE 0 END) / COUNT(*)) * 100 as error_rate
      FROM media_analytics
      WHERE timestamp >= ?
    `, [startDate]);
    
    return result[0];
  }

  async getGeographicDistribution(startDate) {
    // This would require IP geolocation setup
    // For now, return empty array
    return [];
  }

  formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  async cleanup() {
    await databaseService.disconnect();
  }
}

// Main execution
async function main() {
  const reporter = new AnalyticsReporter();
  
  try {
    await reporter.initialize();
    
    const days = parseInt(process.argv[2]) || 7;
    await reporter.generateReport(days);
    
    await reporter.cleanup();
  } catch (error) {
    console.error('Report generation failed:', error);
    process.exit(1);
  }
}

// Check if database service has the required methods
if (!databaseService.query) {
  databaseService.query = async function(sql, params) {
    const db = await this.getConnection();
    return db.query(sql, params);
  };
}

if (!databaseService.getConnection) {
  databaseService.getConnection = async function() {
    if (!this.initialized) await this.initialize();
    return require('../src/database/connection.js').default;
  };
}

if (!databaseService.disconnect) {
  databaseService.disconnect = async function() {
    const db = await this.getConnection();
    if (db && db.disconnect) await db.disconnect();
  };
}

main();