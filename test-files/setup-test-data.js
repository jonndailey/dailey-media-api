#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create test files directory structure
const testDataDir = path.join(__dirname, 'sample-content');
const uploadsDir = path.join(process.cwd(), 'uploads');

console.log('Setting up test data for content serving...');

// Ensure directories exist
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create sample text file
const sampleTextContent = `# Welcome to Dailey Media API

This is a sample markdown file to demonstrate content serving capabilities.

## Features

- **File Serving**: Direct access to files via authenticated endpoints
- **Public Links**: Generate time-limited public access URLs
- **MIME Type Detection**: Automatic content type detection
- **Streaming Support**: Range request support for videos and audio
- **Preview Generation**: Thumbnail support for images

## API Endpoints

### Authenticated Access
- GET /api/serve/files/:id/content - Serve file content
- POST /api/serve/files/:id/public-link - Generate public link
- GET /api/serve/files/:id/preview - Get file preview/thumbnail

### Public Access
- GET /api/serve/public/:token - Access file via public link

## Local Network Testing

These files are accessible on your local network at:
- http://[YOUR_IP]:5173/api/serve/files/:id/content
- http://100.105.97.19:5173/api/serve/files/:id/content (Tailscale)

Happy testing! 🚀
`;

const sampleHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dailey Media API - Test Page</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }
        .content { margin: 20px 0; }
        .feature { background: #f0f0f0; padding: 15px; margin: 10px 0; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Dailey Media API</h1>
        <p>Content Serving Test Page</p>
    </div>
    
    <div class="content">
        <h2>Content Serving Features</h2>
        
        <div class="feature">
            <h3>✅ Authenticated File Access</h3>
            <p>Secure file serving with DAILEY CORE authentication</p>
        </div>
        
        <div class="feature">
            <h3>🔗 Public Link Generation</h3>
            <p>Create time-limited public access URLs for sharing</p>
        </div>
        
        <div class="feature">
            <h3>🎥 Media Streaming</h3>
            <p>Range request support for video and audio files</p>
        </div>
        
        <div class="feature">
            <h3>🖼️ Image Previews</h3>
            <p>Thumbnail generation for image files</p>
        </div>
    </div>
    
    <footer>
        <p><em>This file is served directly from the Dailey Media API</em></p>
    </footer>
</body>
</html>`;

const sampleJsonContent = {
  "name": "Dailey Media API",
  "version": "2.0.0",
  "description": "Universal file storage and content serving API",
  "features": [
    "Authenticated file access",
    "Public link generation",
    "Media streaming",
    "MIME type detection",
    "Preview generation"
  ],
  "endpoints": {
    "serve_file": "/api/serve/files/:id/content",
    "public_link": "/api/serve/files/:id/public-link", 
    "public_access": "/api/serve/public/:token",
    "preview": "/api/serve/files/:id/preview"
  },
  "network_access": {
    "local": "http://localhost:5173",
    "tailscale": "http://100.105.97.19:5173",
    "note": "Replace with your actual IP for local network testing"
  },
  "test_data": {
    "created": new Date().toISOString(),
    "purpose": "Demonstrate content serving capabilities",
    "files": [
      "sample-readme.md",
      "test-page.html", 
      "api-info.json",
      "sample-styles.css"
    ]
  }
};

const sampleCssContent = `/* Dailey Media API - Sample Stylesheet */

:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  --text-color: #333;
  --bg-color: #f8f9fa;
  --border-radius: 8px;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  line-height: 1.6;
  color: var(--text-color);
  background-color: var(--bg-color);
  margin: 0;
  padding: 20px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  border-radius: var(--border-radius);
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  overflow: hidden;
}

.header {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  padding: 2rem;
  text-align: center;
}

.header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2.5rem;
}

.content {
  padding: 2rem;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin: 2rem 0;
}

.feature-card {
  background: var(--bg-color);
  padding: 1.5rem;
  border-radius: var(--border-radius);
  border-left: 4px solid var(--primary-color);
}

.feature-card h3 {
  margin-top: 0;
  color: var(--primary-color);
}

.code-block {
  background: #f1f3f4;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 1rem;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  overflow-x: auto;
}

.btn {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: var(--primary-color);
  color: white;
  text-decoration: none;
  border-radius: var(--border-radius);
  transition: background-color 0.3s ease;
}

.btn:hover {
  background: var(--secondary-color);
}

@media (max-width: 768px) {
  body {
    padding: 10px;
  }
  
  .header h1 {
    font-size: 2rem;
  }
  
  .content {
    padding: 1rem;
  }
}`;

// Create test files
const testFiles = [
  { name: 'sample-readme.md', content: sampleTextContent },
  { name: 'test-page.html', content: sampleHtmlContent },
  { name: 'api-info.json', content: JSON.stringify(sampleJsonContent, null, 2) },
  { name: 'sample-styles.css', content: sampleCssContent }
];

console.log('Creating test files...');

testFiles.forEach((file, index) => {
  const fileId = `test-${(index + 1).toString().padStart(3, '0')}`;
  const fileName = `${fileId}-${file.name}`;
  const filePath = path.join(uploadsDir, fileName);
  
  fs.writeFileSync(filePath, file.content);
  console.log(`✓ Created: ${fileName}`);
});

// Create a sample image using SVG
const sampleSvgContent = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <rect width="100%" height="100%" fill="url(#bg)"/>
  
  <circle cx="200" cy="150" r="80" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="3"/>
  
  <text x="200" y="100" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="white" font-weight="bold">
    Dailey Media API
  </text>
  
  <text x="200" y="130" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="white">
    Content Serving Test
  </text>
  
  <text x="200" y="200" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="white">
    📁 File ID: test-005
  </text>
  
  <text x="200" y="220" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="rgba(255,255,255,0.8)">
    SVG Image • ${new Date().toLocaleDateString()}
  </text>
</svg>`;

const svgFileName = 'test-005-sample-image.svg';
const svgFilePath = path.join(uploadsDir, svgFileName);
fs.writeFileSync(svgFilePath, sampleSvgContent);
console.log(`✓ Created: ${svgFileName}`);

console.log('\\n🎉 Test data setup complete!');
console.log('\\nAvailable test files:');
console.log('- test-001-sample-readme.md (Markdown)');
console.log('- test-002-test-page.html (HTML)');
console.log('- test-003-api-info.json (JSON)'); 
console.log('- test-004-sample-styles.css (CSS)');
console.log('- test-005-sample-image.svg (SVG Image)');

console.log('\\n🌐 Access these files via:');
console.log('- Authenticated: GET /api/serve/files/test-001/content');
console.log('- Public Link: POST /api/serve/files/test-001/public-link');
console.log('- Preview: GET /api/serve/files/test-005/preview');

console.log('\\n🏠 Local network URLs:');
console.log('- http://localhost:5173/api/serve/files/test-001/content');
console.log('- http://100.105.97.19:5173/api/serve/files/test-001/content (Tailscale)');