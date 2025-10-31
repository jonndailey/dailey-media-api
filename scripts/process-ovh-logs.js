#!/usr/bin/env node

/**
 * OVH S3 Access Log Processor
 * 
 * Processes OVH Object Storage access logs to extract detailed analytics
 * including bandwidth usage, request patterns, and error rates.
 * 
 * Log Format (AWS S3 Compatible):
 * bucket_owner canonical_id bucket [timestamp] remote_ip requester request_id operation key request_uri status error_code bytes_sent object_size total_time turnaround_time referer user_agent version_id
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import databaseService from '../src/services/databaseService.js';

class OVHLogProcessor {
  constructor() {
    this.stats = {
      totalRequests: 0,
      totalBandwidth: 0,
      errors: 0,
      byStatus: {},
      byOperation: {},
      byFile: {},
      byHour: {},
      byIP: {}
    };
  }

  /**
   * Parse a single S3 access log line
   */
  parseLine(line) {
    // S3 log format regex
    const logRegex = /(\S+) (\S+) \[([\w\/: +-]+)\] (\S+) (\S+) (\S+) (\S+) (\S+) "([^"]*)" (\d{3}) (\S+) (\d+|-) (\d+|-) (\d+|-) (\d+|-) "([^"]*)" "([^"]*)" (\S+)/;
    
    const match = line.match(logRegex);
    if (!match) return null;

    return {
      bucket: match[1],
      timestamp: new Date(match[3].replace(/(\d{2})\/(\w{3})\/(\d{4}):/, '$1 $2 $3 ')),
      remoteIp: match[4],
      requester: match[5],
      requestId: match[6],
      operation: match[7],
      key: match[8],
      requestUri: match[9],
      httpStatus: parseInt(match[10]),
      errorCode: match[11] !== '-' ? match[11] : null,
      bytesSent: match[12] !== '-' ? parseInt(match[12]) : 0,
      objectSize: match[13] !== '-' ? parseInt(match[13]) : 0,
      totalTime: match[14] !== '-' ? parseInt(match[14]) : 0,
      turnaroundTime: match[15] !== '-' ? parseInt(match[15]) : 0,
      referer: match[16] !== '-' ? match[16] : null,
      userAgent: match[17],
      versionId: match[18] !== '-' ? match[18] : null
    };
  }

  /**
   * Extract app context from referer or user agent
   */
  detectApplication(logEntry) {
    if (logEntry.referer) {
      if (logEntry.referer.includes('castingly')) return 'castingly';
      if (logEntry.referer.includes('dailey')) return 'dailey-core';
    }
    return 'direct';
  }

  /**
   * Extract media file ID from S3 key
   */
  extractFileInfo(key) {
    // Pattern: files/userId/bucketId/path/filename
    const match = key.match(/files\/([^\/]+)\/([^\/]+)\/(.+)/);
    if (!match) return null;
    
    return {
      userId: match[1],
      bucketId: match[2],
      path: match[3]
    };
  }

  /**
   * Process a log file
   */
  async processLogFile(filePath) {
    console.log(`Processing ${filePath}...`);
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      const entry = this.parseLine(line);
      if (!entry) continue;

      // Update statistics
      this.stats.totalRequests++;
      this.stats.totalBandwidth += entry.bytesSent;
      
      if (entry.httpStatus >= 400) {
        this.stats.errors++;
      }

      // Track by status code
      this.stats.byStatus[entry.httpStatus] = (this.stats.byStatus[entry.httpStatus] || 0) + 1;
      
      // Track by operation
      this.stats.byOperation[entry.operation] = (this.stats.byOperation[entry.operation] || 0) + 1;
      
      // Track by hour
      const hour = entry.timestamp.getHours();
      this.stats.byHour[hour] = (this.stats.byHour[hour] || 0) + 1;

      // Track by IP
      if (!this.stats.byIP[entry.remoteIp]) {
        this.stats.byIP[entry.remoteIp] = { requests: 0, bandwidth: 0 };
      }
      this.stats.byIP[entry.remoteIp].requests++;
      this.stats.byIP[entry.remoteIp].bandwidth += entry.bytesSent;

      // Extract file info and record in database
      const fileInfo = this.extractFileInfo(entry.key);
      if (fileInfo && entry.operation === 'REST.GET.OBJECT') {
        const appId = this.detectApplication(entry);
        
        // Find media file by storage key
        try {
          const storageKey = `files/${fileInfo.userId}/${fileInfo.bucketId}/${fileInfo.path}`;
          const media = await databaseService.getMediaFileByStorageKey(storageKey);
          
          if (media && media.id) {
            // Record analytics event
            await databaseService.recordAnalyticsEvent({
              mediaFileId: media.id,
              eventType: 'view',
              userId: null, // Can't determine from logs alone
              applicationId: appId,
              ip: entry.remoteIp,
              userAgent: entry.userAgent,
              referer: entry.referer,
              variantType: null,
              metadata: {
                source: 'ovh_logs',
                bytes: entry.bytesSent,
                response_time: entry.totalTime,
                status: entry.httpStatus,
                error_code: entry.errorCode
              }
            });
          }
        } catch (err) {
          console.error(`Failed to record analytics for ${entry.key}:`, err.message);
        }
      }
    }

    console.log('Processing complete.');
    this.printStats();
  }

  printStats() {
    console.log('\n=== OVH S3 Access Log Statistics ===');
    console.log(`Total Requests: ${this.stats.totalRequests}`);
    console.log(`Total Bandwidth: ${this.formatBytes(this.stats.totalBandwidth)}`);
    console.log(`Error Rate: ${((this.stats.errors / this.stats.totalRequests) * 100).toFixed(2)}%`);
    
    console.log('\nTop Status Codes:');
    Object.entries(this.stats.byStatus)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([status, count]) => {
        console.log(`  ${status}: ${count} requests`);
      });

    console.log('\nOperations:');
    Object.entries(this.stats.byOperation)
      .forEach(([op, count]) => {
        console.log(`  ${op}: ${count}`);
      });

    console.log('\nTop IPs by Bandwidth:');
    Object.entries(this.stats.byIP)
      .sort((a, b) => b[1].bandwidth - a[1].bandwidth)
      .slice(0, 10)
      .forEach(([ip, data]) => {
        console.log(`  ${ip}: ${data.requests} requests, ${this.formatBytes(data.bandwidth)}`);
      });
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// Main execution
async function main() {
  const logFile = process.argv[2];
  
  if (!logFile) {
    console.error('Usage: node process-ovh-logs.js <log-file>');
    console.error('Example: node process-ovh-logs.js /tmp/ovh-access-logs/2025-10-30.log');
    process.exit(1);
  }

  if (!fs.existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`);
    process.exit(1);
  }

  const processor = new OVHLogProcessor();
  
  try {
    await databaseService.initialize();
    await processor.processLogFile(logFile);
  } catch (error) {
    console.error('Processing failed:', error);
    process.exit(1);
  }
}

main();