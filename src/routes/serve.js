import express from 'express';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
// Using console.log for logging (logger middleware doesn't export a logger object)
import { authenticateToken } from '../middleware/dailey-auth.js';
import config from '../config/index.js';

const router = express.Router();

// Serve files directly by user ID and filename (for development)
router.get('/files/:userId/:filename', async (req, res) => {
  try {
    const { userId, filename } = req.params;
    
    // Construct file path in storage directory
    const storageDir = path.join(process.cwd(), 'storage', 'files', userId);
    const filePath = path.join(storageDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // Determine MIME type
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    // Set appropriate headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow cross-origin access
    
    // Handle range requests for video/audio streaming
    const range = req.headers.range;
    if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunksize);
      
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      // Stream the entire file
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
    
    // Log access
    console.log(`File served: ${filename} from user ${userId}`);
    
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to serve file content'
    });
  }
});

// Serve files with bucket support (including nested paths)
router.get('/files/:userId/:bucketId/*', async (req, res) => {
  try {
    const { userId, bucketId } = req.params;
    const filePath = req.params[0]; // This captures the rest of the path after bucketId
    
    // Construct file path in storage directory with bucket
    const storageDir = path.join(process.cwd(), 'storage', 'files', userId, bucketId);
    const fullFilePath = path.join(storageDir, filePath);
    
    // Check if file exists
    if (!fs.existsSync(fullFilePath)) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }
    
    // Get file stats
    const stats = fs.statSync(fullFilePath);
    const fileSize = stats.size;
    
    // Determine MIME type
    const mimeType = mime.lookup(fullFilePath) || 'application/octet-stream';
    
    // Set appropriate headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow cross-origin access
    
    // Handle range requests for video/audio streaming
    const range = req.headers.range;
    if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunksize);
      
      const stream = fs.createReadStream(fullFilePath, { start, end });
      stream.pipe(res);
    } else {
      // Stream the entire file
      const stream = fs.createReadStream(fullFilePath);
      stream.pipe(res);
    }
    
    // Log access
    console.log(`File served: ${filePath} from user ${userId} bucket ${bucketId}`);
    
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to serve file content'
    });
  }
});

// Serve file content by ID
router.get('/files/:id/content', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // In a real implementation, you would look up the file in the database
    // For now, we'll serve files from the uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    
    // Find file by ID (this would normally be a database lookup)
    const files = fs.readdirSync(uploadsDir);
    const targetFile = files.find(file => file.startsWith(id));
    
    if (!targetFile) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist or has been deleted'
      });
    }
    
    const filePath = path.join(uploadsDir, targetFile);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist on disk'
      });
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // Determine MIME type
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    // Set appropriate headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(targetFile)}"`);
    
    // Handle range requests for video/audio streaming
    const range = req.headers.range;
    if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunksize);
      
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      // Stream the entire file
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
    
    // Log access
    console.log(`File served: ${targetFile} to user ${req.user?.email || 'unknown'}`);
    
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to serve file content'
    });
  }
});

// Generate public access URL for a file
router.post('/files/:id/public-link', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresIn = '24h' } = req.body;
    
    // Check if user has permission to create public links
    if (!req.userRoles.includes('api.write') && !req.user.isAdmin) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'You do not have permission to create public links'
      });
    }
    
    // Generate a temporary access token (simplified - in production use proper JWT)
    const token = Buffer.from(`${id}:${Date.now()}:${expiresIn}`).toString('base64');
    
    // Construct public URL (accessible on local network)
    const publicUrl = `http://${req.get('host')}/api/serve/public/${token}`;
    
    res.json({
      success: true,
      publicUrl,
      expiresIn,
      message: 'Public link generated successfully'
    });
    
    console.log(`Public link generated for file ${id} by user ${req.user?.email}`);
    
  } catch (error) {
    console.error('Error generating public link:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to generate public link'
    });
  }
});

// Serve files via public link (no authentication required)
router.get('/public/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Decode token (simplified - in production use proper JWT validation)
    const decoded = Buffer.from(token, 'base64').toString();
    const [fileId, timestamp, expiresIn] = decoded.split(':');
    
    // Check if link has expired (simplified expiration check)
    const createdAt = parseInt(timestamp);
    const now = Date.now();
    const expiry = expiresIn === '24h' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    
    if (now - createdAt > expiry) {
      return res.status(410).json({
        error: 'Link expired',
        message: 'This public link has expired'
      });
    }
    
    // Serve the file (reuse logic from authenticated endpoint)
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const files = fs.readdirSync(uploadsDir);
    const targetFile = files.find(file => file.startsWith(fileId));
    
    if (!targetFile) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }
    
    const filePath = path.join(uploadsDir, targetFile);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist on disk'
      });
    }
    
    // Get file stats and MIME type
    const stats = fs.statSync(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    // Set headers for public access
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(targetFile)}"`);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow cross-origin access
    
    // Stream the file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
    console.log(`Public file access: ${targetFile} via token`);
    
  } catch (error) {
    console.error('Error serving public file:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to serve file content'
    });
  }
});

// Get file preview/thumbnail
router.get('/files/:id/preview', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // For images, serve a resized version (this is a simplified implementation)
    // In production, you'd want to generate and cache thumbnails
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const files = fs.readdirSync(uploadsDir);
    const targetFile = files.find(file => file.startsWith(id));
    
    if (!targetFile) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }
    
    const filePath = path.join(uploadsDir, targetFile);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    if (mimeType.startsWith('image/')) {
      // For now, just serve the original image
      // TODO: Implement image resizing for thumbnails
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } else {
      // For non-images, return file info
      const stats = fs.statSync(filePath);
      res.json({
        filename: path.basename(targetFile),
        size: stats.size,
        mimeType,
        isPreviewable: false,
        message: 'Preview not available for this file type'
      });
    }
    
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to generate preview'
    });
  }
});

export default router;