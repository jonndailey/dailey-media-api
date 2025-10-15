# @dailey/media-cli

Production-ready command-line interface for the Dailey Media API. Provides powerful file management, bucket operations, and analytics from your terminal.

## Installation

Install globally for system-wide access:

```bash
npm install -g @dailey/media-cli
```

Or use directly with npx:

```bash
npx @dailey/media-cli --help
```

## Configuration

Configure your API credentials and default settings:

```bash
dmedia config
```

This will prompt you for:
- **API Key**: Your Dailey Media API key
- **Base URL**: API endpoint (default: https://api.dailey.dev)
- **Default Bucket**: Optional default bucket for uploads

Configuration is stored in `~/.dmedia-config.json`

## Commands

### File Operations

#### Upload Files
Upload single or multiple files with pattern matching:

```bash
# Upload single file
dmedia upload photo.jpg

# Upload multiple files
dmedia upload *.jpg *.png

# Upload with bucket and folder
dmedia upload photos/* --bucket family-photos --folder vacation/2024

# Upload with tags
dmedia upload *.jpg --tags vacation,family,summer --verbose
```

**Options:**
- `-b, --bucket <bucket>` - Target bucket name
- `-f, --folder <folder>` - Target folder path (supports nested: folder/subfolder)
- `-t, --tags <tags>` - Comma-separated tags
- `-v, --verbose` - Show detailed output including URLs

#### List Files
Browse and filter your uploaded files:

```bash
# List all files
dmedia ls

# List files in specific bucket
dmedia ls --bucket photos

# List files in folder
dmedia ls --bucket photos --folder vacation/2024

# Verbose output with URLs and metadata
dmedia ls --verbose
```

**Aliases:** `list`

#### Download Files
Download files by ID with optional custom output path:

```bash
# Download with original filename
dmedia download file-id-123

# Download with custom filename
dmedia download file-id-123 --output ./my-photo.jpg
```

#### Delete Files
Safely delete files with confirmation prompt:

```bash
dmedia delete file-id-123

# Alias
dmedia rm file-id-123
```

### Bucket Management

#### List Buckets
View all accessible buckets with metadata:

```bash
dmedia buckets
```

Shows bucket name, access level (public/private), file count, and creation date.

### Analytics

#### View Usage Statistics
Get insights into your media usage:

```bash
dmedia analytics

# Alias
dmedia stats
```

Displays:
- Total file count
- Total storage used
- Recent upload activity
- Top bucket usage

### Video Processing

#### Inspect Presets
```bash
dmedia video-presets
```
Lists the available transcoding presets (format, codecs, bitrate, resolution).

#### Queue a Processing Job
```bash
# Use default presets defined on the server
dmedia video-process media-file-id

# Target specific presets
dmedia video-process media-file-id --preset 1080p_h264 --preset 720p_h264

# Supply a custom output definition (JSON string)
dmedia video-process media-file-id --output '{"format":"webm","videoCodec":"libvpx-vp9","resolution":"1280x720"}'

# Include a webhook for completion callbacks
dmedia video-process media-file-id --preset 1080p_h264 --webhook https://app.example.com/hooks/video
```

#### Monitor Jobs
```bash
# List jobs for a media asset
dmedia video-jobs media-file-id --status processing

# Inspect a single job
dmedia video-job job-id-123
```

## Examples

### Batch Photo Upload
Upload vacation photos with organization:

```bash
dmedia upload vacation-photos/*.jpg \
  --bucket family-photos \
  --folder vacations/hawaii-2024 \
  --tags vacation,hawaii,family \
  --verbose
```

### Content Management Workflow
```bash
# List current buckets
dmedia buckets

# Upload marketing assets
dmedia upload assets/*.png --bucket marketing --folder banners/2024

# Check upload status
dmedia ls --bucket marketing --folder banners/2024 --verbose

# Download for editing
dmedia download banner-123 --output ./banner-edit.png

# Clean up old files
dmedia delete old-banner-456
```

### Development Workflow
```bash
# Check API connectivity
dmedia analytics

# Upload test files
dmedia upload test-files/* --bucket development --folder testing

# Verify uploads
dmedia ls --bucket development --verbose
```

## Configuration File

The CLI stores configuration in `~/.dmedia-config.json`:

```json
{
  "apiKey": "dmapi_prod_...",
  "baseURL": "https://api.dailey.dev", 
  "defaultBucket": "my-default-bucket"
}
```

## Error Handling

The CLI provides clear error messages and suggestions:

- **Missing API Key**: Prompts to run `dmedia config`
- **File Not Found**: Shows available files and patterns
- **Permission Denied**: Explains required permissions
- **Rate Limited**: Shows retry suggestions
- **Network Issues**: Displays connectivity troubleshooting

## Output Formats

### Standard Output
Clean, human-readable output with icons and colors:

```
📤 Uploading 3 file(s)...
[████████████████████████████████████████] 3/3 100% photo.jpg

✓ photo.jpg (file-123)
✓ document.pdf (file-124)  
✓ video.mp4 (file-125)
```

### Verbose Output
Detailed information including metadata and URLs:

```
✓ photo.jpg (file-123)
  URL: https://api.dailey.dev/serve/file-123
  Size: 2.4 MB | Type: image/jpeg | Date: 2024-01-15
  Bucket: photos | Path: vacation/hawaii
```

## Security

- API keys are stored securely in user config
- All requests use HTTPS encryption
- Automatic token validation and error handling
- No credentials logged in verbose output

## Development

Built with TypeScript and modern Node.js:

- **Commander.js** - CLI framework
- **Chalk** - Terminal colors
- **Ora** - Progress spinners
- **Inquirer** - Interactive prompts
- **Progress** - Upload progress bars

## Troubleshooting

### Common Issues

1. **"Please configure your API key first"**
   ```bash
   dmedia config
   ```

2. **"API connection failed"**
   - Check internet connectivity
   - Verify API key is valid
   - Confirm base URL is correct

3. **"Permission denied"**
   - Verify API key has required permissions
   - Check bucket access rights

4. **"File too large"**
   - Check file size limits in API settings
   - Consider compressing large files

### Debug Mode

Enable detailed logging:

```bash
DEBUG=dmedia* dmedia upload file.jpg
```

## Support

- 📖 **Documentation**: [User Guide](../docs/user-guide.md)
- 🐛 **Issues**: [GitHub Issues](https://github.com/jonndailey/dailey-media-api/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/jonndailey/dailey-media-api/discussions)

## License

UNLICENSED - Internal Dailey Software project
