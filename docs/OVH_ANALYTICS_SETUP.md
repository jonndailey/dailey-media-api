# OVH S3 Analytics Setup Guide

## Overview
This guide walks through setting up comprehensive analytics by combining DMAPI application-level tracking with OVH S3 access logs for complete visibility into media usage.

## Current Analytics Architecture

### 1. Application-Level Tracking (Live Now ✅)
- **What**: User actions, authentication context, app attribution
- **When**: Real-time as requests happen
- **Where**: MySQL database (`media_analytics` table)
- **Coverage**: All authenticated requests + anonymous with referer

### 2. Infrastructure-Level Tracking (OVH Logs)
- **What**: Exact bandwidth, CDN performance, error rates
- **When**: Hourly log delivery
- **Where**: S3 bucket for logs → processed into database
- **Coverage**: 100% of S3 requests

## Setting Up OVH S3 Access Logging

### Step 1: Enable Logging via OVH API

```bash
# Using OVH API or OpenStack Swift
# Configure bucket logging
curl -X PUT "https://storage.${REGION}.cloud.ovh.net/v1/AUTH_${PROJECT}/dailey-media-api-storage/?logging" \
  -H "X-Auth-Token: ${TOKEN}" \
  -H "Content-Type: application/xml" \
  -d '
  <BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <LoggingEnabled>
      <TargetBucket>dailey-media-logs</TargetBucket>
      <TargetPrefix>access-logs/</TargetPrefix>
    </LoggingEnabled>
  </BucketLoggingStatus>'
```

### Step 2: Create Log Processing Bucket

```bash
# Create dedicated bucket for logs
curl -X PUT "https://storage.${REGION}.cloud.ovh.net/v1/AUTH_${PROJECT}/dailey-media-logs" \
  -H "X-Auth-Token: ${TOKEN}"
```

### Step 3: Set Up Daily Processing

Add to production crontab:
```bash
# Process OVH access logs daily at 3 AM
0 3 * * * cd /opt/dailey-media-api/current && node scripts/process-ovh-logs.js /mnt/logs/$(date -d yesterday +\%Y-\%m-\%d).log >> /var/log/ovh-processing.log 2>&1
```

## Log Format

OVH S3 access logs follow AWS S3 format:
```
bucket_owner canonical_id bucket [timestamp] remote_ip requester request_id operation key request_uri status error_code bytes_sent object_size total_time turnaround_time referer user_agent version_id
```

Example:
```
dailey-media-api-storage 98765 dailey-media-api-storage [30/Oct/2025:21:11:08 +0000] 172.71.223.210 - ABC123 REST.GET.OBJECT files/1cf9a704/castingly-public/actors/1cf9a704/headshots/test.jpg "GET /files/1cf9a704/castingly-public/actors/1cf9a704/headshots/test.jpg HTTP/1.1" 200 - 524288 524288 42 40 "https://castingly.dailey.dev" "Mozilla/5.0" -
```

## Metrics Available

### From Application Tracking (Real-time)
- User ID and email
- Application source (castingly, dailey-core, etc.)
- Authentication context
- User journey tracking
- Session information

### From OVH Logs (Daily)
- **Exact bandwidth usage** - Every byte counted
- **Response times** - Total and turnaround time
- **Error rates** - 4xx, 5xx responses by endpoint
- **CDN performance** - Cache hit/miss ratios
- **Geographic distribution** - IP geolocation
- **Cost tracking** - Direct correlation to billing

## Analytics Dashboard Queries

### Combined View: Top Files by Bandwidth
```sql
SELECT 
    mf.original_filename,
    mf.mime_type,
    COUNT(DISTINCT ma.id) as access_count,
    COUNT(DISTINCT ma.user_id) as unique_users,
    COUNT(DISTINCT ma.ip_address) as unique_ips,
    SUM(CAST(JSON_EXTRACT(ma.metadata, '$.bytes') AS UNSIGNED)) as total_bandwidth,
    MAX(ma.timestamp) as last_accessed
FROM media_analytics ma
JOIN media_files mf ON ma.media_file_id = mf.id
WHERE ma.timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    AND ma.application_id = 'castingly'
GROUP BY mf.id
ORDER BY total_bandwidth DESC
LIMIT 20;
```

### Cost Analysis: Bandwidth by Application
```sql
SELECT 
    application_id,
    DATE(timestamp) as date,
    COUNT(*) as requests,
    SUM(CAST(JSON_EXTRACT(metadata, '$.bytes') AS UNSIGNED)) as bandwidth,
    -- OVH charges ~$0.011 per GB for bandwidth
    ROUND(SUM(CAST(JSON_EXTRACT(metadata, '$.bytes') AS UNSIGNED)) / 1073741824 * 0.011, 2) as estimated_cost_usd
FROM media_analytics
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    AND JSON_EXTRACT(metadata, '$.source') = 'ovh_logs'
GROUP BY application_id, DATE(timestamp)
ORDER BY date DESC, bandwidth DESC;
```

### Performance Monitoring: Response Times
```sql
SELECT 
    DATE(timestamp) as date,
    AVG(CAST(JSON_EXTRACT(metadata, '$.response_time') AS UNSIGNED)) as avg_response_ms,
    MAX(CAST(JSON_EXTRACT(metadata, '$.response_time') AS UNSIGNED)) as max_response_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY CAST(JSON_EXTRACT(metadata, '$.response_time') AS UNSIGNED)) as p95_response_ms
FROM media_analytics
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    AND JSON_EXTRACT(metadata, '$.response_time') IS NOT NULL
GROUP BY DATE(timestamp)
ORDER BY date DESC;
```

## Monitoring & Alerts

### Key Metrics to Monitor
1. **Bandwidth Usage** - Alert if daily usage exceeds threshold
2. **Error Rate** - Alert if >1% of requests fail
3. **Response Time** - Alert if P95 > 1000ms
4. **Unique IPs** - Detect potential abuse/scraping
5. **Cost Projection** - Alert if monthly projection exceeds budget

### Setting Up Alerts
```javascript
// Add to monitoring script
async function checkAnalytics() {
  const stats = await db.query(`
    SELECT 
      COUNT(*) as requests_today,
      SUM(CAST(JSON_EXTRACT(metadata, '$.bytes') AS UNSIGNED)) as bandwidth_today,
      SUM(CASE WHEN CAST(JSON_EXTRACT(metadata, '$.status') AS UNSIGNED) >= 400 THEN 1 ELSE 0 END) / COUNT(*) as error_rate
    FROM media_analytics
    WHERE DATE(timestamp) = CURDATE()
  `);
  
  if (stats.bandwidth_today > 100 * 1024 * 1024 * 1024) { // 100GB
    await sendAlert('High bandwidth usage', stats);
  }
  
  if (stats.error_rate > 0.01) { // 1% error rate
    await sendAlert('High error rate', stats);
  }
}
```

## Implementation Timeline

1. **Week 1**: 
   - ✅ Deploy application-level tracking
   - ✅ Fix analytics dashboard
   - ⏳ Enable OVH logging

2. **Week 2**:
   - Set up log ingestion pipeline
   - Test log processing script
   - Create monitoring alerts

3. **Week 3**:
   - Build combined analytics dashboard
   - Add cost tracking reports
   - Document for team

## Cost-Benefit Analysis

### Costs
- OVH log storage: ~$0.023/GB/month (negligible for logs)
- Processing time: ~5 minutes/day automated
- Development: One-time setup

### Benefits
- **Accurate billing**: Know exact bandwidth usage
- **Performance optimization**: Identify slow endpoints
- **Security**: Detect abuse patterns
- **Cost control**: Track and optimize usage
- **User insights**: Understand usage patterns

## Troubleshooting

### Logs not appearing
- Check bucket policy allows logging
- Verify target bucket exists
- Logs appear with ~1 hour delay

### Processing script fails
- Check database connection
- Verify log format matches parser
- Check disk space for log storage

### Analytics mismatch
- Application tracking = user-initiated
- OVH logs = all requests including bots
- Some variance is normal

## Support

For issues with:
- OVH setup: Check OVH Object Storage documentation
- Processing script: See `/scripts/process-ovh-logs.js`
- Analytics queries: Check `/src/services/analyticsService.js`