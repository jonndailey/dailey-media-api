import { useState } from 'react'
import { 
  Book, 
  Code, 
  Terminal, 
  FileText, 
  Database, 
  Key,
  Zap,
  Globe,
  Shield,
  Package,
  Copy,
  CheckCircle
} from 'lucide-react'

export default function DocsTab() {
  const [activeSection, setActiveSection] = useState('quickstart')
  const [copiedText, setCopiedText] = useState('')

  const sections = [
    { id: 'quickstart', label: 'Quick Start', icon: Zap },
    { id: 'authentication', label: 'Authentication', icon: Key },
    { id: 'upload', label: 'Upload Files', icon: FileText },
    { id: 'retrieve', label: 'Retrieve Files', icon: Database },
    { id: 'transform', label: 'Transformations', icon: Package },
    { id: 'examples', label: 'Code Examples', icon: Code },
    { id: 'limits', label: 'Limits & Quotas', icon: Shield },
    { id: 'sdks', label: 'SDKs & Libraries', icon: Globe }
  ]

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text)
    setCopiedText(label)
    setTimeout(() => setCopiedText(''), 2000)
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="sticky top-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Documentation</h3>
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === section.id
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{section.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 max-w-4xl">
        {activeSection === 'quickstart' && <QuickStartSection copyToClipboard={copyToClipboard} copiedText={copiedText} />}
        {activeSection === 'authentication' && <AuthenticationSection copyToClipboard={copyToClipboard} copiedText={copiedText} />}
        {activeSection === 'upload' && <UploadSection copyToClipboard={copyToClipboard} copiedText={copiedText} />}
        {activeSection === 'retrieve' && <RetrieveSection copyToClipboard={copyToClipboard} copiedText={copiedText} />}
        {activeSection === 'transform' && <TransformSection copyToClipboard={copyToClipboard} copiedText={copiedText} />}
        {activeSection === 'examples' && <ExamplesSection copyToClipboard={copyToClipboard} copiedText={copiedText} />}
        {activeSection === 'limits' && <LimitsSection />}
        {activeSection === 'sdks' && <SDKsSection />}
      </div>
    </div>
  )
}

function QuickStartSection({ copyToClipboard, copiedText }) {
  const baseUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:4000' 
    : `http://${window.location.hostname}:4000`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Quick Start Guide</h2>
        <p className="text-slate-600">Get up and running with the Dailey Media API in under 5 minutes.</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">🚀 Base URL</h3>
        <div className="flex items-center space-x-2">
          <code className="flex-1 block bg-white px-3 py-2 rounded border border-blue-200">
            {baseUrl}/api
          </code>
          <button
            onClick={() => copyToClipboard(`${baseUrl}/api`, 'base-url')}
            className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
          >
            {copiedText === 'base-url' ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-blue-600" />}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">1. Get Your API Key</h3>
        <p className="text-slate-600">First, create an API key from the API Keys tab. You'll get a key that looks like:</p>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
          <code>dmapi_prod_zR0XufVsrw2EIawIwnTV9HravIRQcKtI</code>
        </pre>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">2. Make Your First Upload</h3>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
            <code>{`curl -X POST ${baseUrl}/api/upload \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "file=@/path/to/any/file.pdf"`}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(`curl -X POST ${baseUrl}/api/upload \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -F "file=@/path/to/any/file.pdf"`, 'curl-upload')}
            className="absolute top-2 right-2 p-2 hover:bg-slate-800 rounded transition-colors"
          >
            {copiedText === 'curl-upload' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
          </button>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">3. Response</h3>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
          <code>{`{
  "success": true,
  "file": {
    "id": "file_abc123",
    "filename": "document.pdf",
    "size": 2048576,
    "mime": "application/pdf",
    "category": "documents",
    "url": "${baseUrl}/storage/files/abc123.pdf",
    "metadata": {
      "pages": 24,
      "textPreview": "First 200 characters of text..."
    },
    "uploaded_at": "2025-01-15T10:30:00Z"
  }
}`}</code>
        </pre>
      </div>
    </div>
  )
}

function AuthenticationSection({ copyToClipboard, copiedText }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Authentication</h2>
        <p className="text-slate-600">The Dailey Media API uses API keys for authentication. Include your key in the request headers.</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Header Authentication</h3>
        <p className="text-slate-600">Include your API key in the X-API-Key header:</p>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
          <code>{`X-API-Key: dmapi_prod_zR0XufVsrw2EIawIwnTV9HravIRQcKtI`}</code>
        </pre>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">Example Request</h3>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
            <code>{`fetch('http://localhost:4000/api/files', {
  headers: {
    'X-API-Key': 'dmapi_prod_zR0XufVsrw2EIawIwnTV9HravIRQcKtI'
  }
})
.then(res => res.json())
.then(data => console.log(data))`}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(`fetch('http://localhost:4000/api/files', {\n  headers: {\n    'X-API-Key': 'dmapi_prod_zR0XufVsrw2EIawIwnTV9HravIRQcKtI'\n  }\n})\n.then(res => res.json())\n.then(data => console.log(data))`, 'auth-example')}
            className="absolute top-2 right-2 p-2 hover:bg-slate-800 rounded transition-colors"
          >
            {copiedText === 'auth-example' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
          </button>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">API Key Scopes</h3>
        <div className="bg-slate-50 rounded-lg p-4">
          <ul className="space-y-2">
            <li className="flex items-start">
              <span className="text-green-500 mr-2">•</span>
              <div>
                <strong className="text-slate-900">upload</strong>
                <p className="text-sm text-slate-600">Allows uploading new files of any type</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">•</span>
              <div>
                <strong className="text-slate-900">files</strong>
                <p className="text-sm text-slate-600">Read access to all file types</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">•</span>
              <div>
                <strong className="text-slate-900">media</strong>
                <p className="text-sm text-slate-600">Legacy - same as files scope</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">•</span>
              <div>
                <strong className="text-slate-900">transform</strong>
                <p className="text-sm text-slate-600">Image transformation operations</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">•</span>
              <div>
                <strong className="text-slate-900">delete</strong>
                <p className="text-sm text-slate-600">Delete files</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function UploadSection({ copyToClipboard, copiedText }) {
  const baseUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:4000' 
    : `http://${window.location.hostname}:4000`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Upload Files</h2>
        <p className="text-slate-600">Upload any type of file to the Dailey Media API. We support ALL file formats!</p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-semibold text-green-900 mb-2">✅ Supported File Types</h3>
        <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-green-800">
          <div>📸 Images (JPEG, PNG, GIF, WebP, SVG, RAW)</div>
          <div>📄 Documents (PDF, Word, Excel, PowerPoint)</div>
          <div>🎥 Videos (MP4, AVI, MOV, WebM)</div>
          <div>🎵 Audio (MP3, WAV, FLAC, AAC)</div>
          <div>📦 Archives (ZIP, RAR, TAR, 7Z)</div>
          <div>💻 Code (JS, Python, Go, any text file)</div>
          <div>🗂️ Data (JSON, XML, CSV, SQL)</div>
          <div>✨ ANY other file type up to 100MB!</div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Single File Upload</h3>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
            <code>{`POST /api/upload
Content-Type: multipart/form-data

curl -X POST ${baseUrl}/api/upload \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "file=@document.pdf"`}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(`curl -X POST ${baseUrl}/api/upload \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -F "file=@document.pdf"`, 'single-upload')}
            className="absolute top-2 right-2 p-2 hover:bg-slate-800 rounded transition-colors"
          >
            {copiedText === 'single-upload' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
          </button>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">Multiple File Upload</h3>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
          <code>{`curl -X POST ${baseUrl}/api/upload \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "files[]=@photo1.jpg" \\
  -F "files[]=@photo2.jpg" \\
  -F "files[]=@document.pdf" \\
  -F "files[]=@video.mp4"`}</code>
        </pre>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">JavaScript Example</h3>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
            <code>{`const formData = new FormData()
formData.append('file', fileInput.files[0])

fetch('${baseUrl}/api/upload', {
  method: 'POST',
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  },
  body: formData
})
.then(res => res.json())
.then(data => {
  console.log('Upload successful!')
  console.log('File URL:', data.file.url)
  console.log('File Type:', data.file.category)
})`}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(`const formData = new FormData()\nformData.append('file', fileInput.files[0])\n\nfetch('${baseUrl}/api/upload', {\n  method: 'POST',\n  headers: {\n    'X-API-Key': 'YOUR_API_KEY'\n  },\n  body: formData\n})\n.then(res => res.json())\n.then(data => {\n  console.log('Upload successful!')\n  console.log('File URL:', data.file.url)\n  console.log('File Type:', data.file.category)\n})`, 'js-upload')}
            className="absolute top-2 right-2 p-2 hover:bg-slate-800 rounded transition-colors"
          >
            {copiedText === 'js-upload' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
          </button>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">Python Example</h3>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
          <code>{`import requests

# Upload any file type
files = {'file': open('presentation.pptx', 'rb')}
headers = {'X-API-Key': 'YOUR_API_KEY'}

response = requests.post(
    '${baseUrl}/api/upload',
    files=files,
    headers=headers
)

data = response.json()
print(f"File URL: {data['file']['url']}")
print(f"Category: {data['file']['category']}")
print(f"Metadata: {data['file']['metadata']}")`}</code>
        </pre>
      </div>
    </div>
  )
}

function RetrieveSection({ copyToClipboard, copiedText }) {
  const baseUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:4000' 
    : `http://${window.location.hostname}:4000`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Retrieve Files</h2>
        <p className="text-slate-600">Access your uploaded files and their metadata.</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Get Single File</h3>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
          <code>{`GET /api/files/:id

curl -H "X-API-Key: YOUR_API_KEY" \\
  ${baseUrl}/api/files/file_abc123`}</code>
        </pre>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">List Files</h3>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
            <code>{`GET /api/files?limit=20&offset=0&category=documents

curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files?limit=20&category=documents"`}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(`curl -H "X-API-Key: YOUR_API_KEY" \\\n  "${baseUrl}/api/files?limit=20&category=documents"`, 'list-files')}
            className="absolute top-2 right-2 p-2 hover:bg-slate-800 rounded transition-colors"
          >
            {copiedText === 'list-files' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
          </button>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">Query Parameters</h3>
        <div className="bg-slate-50 rounded-lg p-4">
          <ul className="space-y-2 text-sm">
            <li><code className="bg-white px-2 py-1 rounded">limit</code> - Number of results (default: 20, max: 100)</li>
            <li><code className="bg-white px-2 py-1 rounded">offset</code> - Pagination offset (default: 0)</li>
            <li><code className="bg-white px-2 py-1 rounded">category</code> - Filter by category:
              <ul className="ml-4 mt-1 text-xs text-slate-600">
                <li>• <code>images</code> - Photos, graphics, screenshots</li>
                <li>• <code>documents</code> - PDFs, Office files, text</li>
                <li>• <code>videos</code> - MP4, AVI, MOV, WebM</li>
                <li>• <code>audio</code> - MP3, WAV, podcasts</li>
                <li>• <code>archives</code> - ZIP, RAR, TAR files</li>
                <li>• <code>code</code> - Source code files</li>
                <li>• <code>data</code> - JSON, XML, CSV, databases</li>
                <li>• <code>other</code> - Everything else</li>
              </ul>
            </li>
            <li><code className="bg-white px-2 py-1 rounded">search</code> - Search in filenames</li>
            <li><code className="bg-white px-2 py-1 rounded">order_by</code> - Sort field (uploaded_at, size, filename)</li>
            <li><code className="bg-white px-2 py-1 rounded">order</code> - Sort direction (asc, desc)</li>
          </ul>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">Response Example</h3>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
          <code>{`{
  "files": [
    {
      "id": "file_abc123",
      "filename": "quarterly-report.pdf",
      "size": 524288,
      "mime": "application/pdf",
      "category": "documents",
      "url": "${baseUrl}/storage/files/abc123.pdf",
      "metadata": {
        "pages": 12,
        "textPreview": "Q3 2024 Financial Report..."
      },
      "uploaded_at": "2025-01-15T10:30:00Z"
    },
    {
      "id": "file_def456",
      "filename": "product-demo.mp4",
      "size": 10485760,
      "mime": "video/mp4",
      "category": "videos",
      "url": "${baseUrl}/storage/files/def456.mp4",
      "metadata": {
        "duration": 180,
        "resolution": "1920x1080"
      },
      "uploaded_at": "2025-01-14T15:45:00Z"
    }
  ],
  "total": 145,
  "limit": 20,
  "offset": 0
}`}</code>
        </pre>
      </div>
    </div>
  )
}

function TransformSection({ copyToClipboard, copiedText }) {
  const baseUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:4000' 
    : `http://${window.location.hostname}:4000`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Image Transformations</h2>
        <p className="text-slate-600">Transform images on-the-fly with our powerful image processing API.</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Resize Images</h3>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
            <code>{`GET /api/files/:id/transform?width=800&height=600&fit=cover

curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files/file_abc123/transform?width=800"`}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(`curl -H "X-API-Key: YOUR_API_KEY" \\\n  "${baseUrl}/api/files/file_abc123/transform?width=800"`, 'transform-resize')}
            className="absolute top-2 right-2 p-2 hover:bg-slate-800 rounded transition-colors"
          >
            {copiedText === 'transform-resize' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
          </button>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">Transformation Parameters</h3>
        <div className="bg-slate-50 rounded-lg p-4">
          <ul className="space-y-3">
            <li>
              <strong>Resize</strong>
              <ul className="ml-4 mt-1 space-y-1 text-sm text-slate-600">
                <li><code>width</code> - Target width in pixels</li>
                <li><code>height</code> - Target height in pixels</li>
                <li><code>fit</code> - Resize mode (cover, contain, fill, inside, outside)</li>
              </ul>
            </li>
            <li>
              <strong>Quality & Format</strong>
              <ul className="ml-4 mt-1 space-y-1 text-sm text-slate-600">
                <li><code>quality</code> - JPEG quality (1-100)</li>
                <li><code>format</code> - Output format (jpeg, png, webp, avif)</li>
              </ul>
            </li>
            <li>
              <strong>Effects</strong>
              <ul className="ml-4 mt-1 space-y-1 text-sm text-slate-600">
                <li><code>blur</code> - Blur radius (1-100)</li>
                <li><code>grayscale</code> - Convert to grayscale (true/false)</li>
                <li><code>rotate</code> - Rotation angle (0-360)</li>
              </ul>
            </li>
          </ul>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6">Examples</h3>
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700 mb-1">Create thumbnail:</p>
            <code className="text-sm text-slate-600">?width=200&height=200&fit=cover</code>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700 mb-1">Convert to WebP:</p>
            <code className="text-sm text-slate-600">?format=webp&quality=85</code>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700 mb-1">Blur background:</p>
            <code className="text-sm text-slate-600">?blur=20</code>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExamplesSection({ copyToClipboard, copiedText }) {
  const [selectedLanguage, setSelectedLanguage] = useState('javascript')
  const baseUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:4000' 
    : `http://${window.location.hostname}:4000`

  const examples = {
    javascript: {
      label: 'JavaScript',
      code: `// Upload any file type
async function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('${baseUrl}/api/upload', {
    method: 'POST',
    headers: {
      'X-API-Key': 'YOUR_API_KEY'
    },
    body: formData
  })

  const result = await response.json()
  console.log('File uploaded:', result.file)
  console.log('Category:', result.file.category)
  return result
}

// List files with pagination and filtering
async function listFiles(page = 1, limit = 20, category = null) {
  const offset = (page - 1) * limit
  const params = new URLSearchParams({ limit, offset })
  
  if (category) params.append('category', category)
  
  const response = await fetch(
    \`${baseUrl}/api/files?\${params}\`,
    {
      headers: {
        'X-API-Key': 'YOUR_API_KEY'
      }
    }
  )

  return response.json()
}

// Transform an image (only works for image files)
function getTransformedUrl(fileId, options) {
  const params = new URLSearchParams(options)
  return \`${baseUrl}/api/files/\${fileId}/transform?\${params}\`
}

// Example: Upload and display different file types
async function handleFileUpload(file) {
  const result = await uploadFile(file)
  
  switch(result.file.category) {
    case 'images':
      // Display with thumbnail
      const thumbUrl = getTransformedUrl(result.file.id, { 
        width: 200, 
        height: 200, 
        fit: 'cover' 
      })
      displayImage(thumbUrl)
      break
      
    case 'documents':
      // Show document info
      displayDocument(result.file)
      break
      
    case 'videos':
      // Show video player
      displayVideo(result.file.url)
      break
      
    default:
      // Show download link
      displayDownload(result.file)
  }
}`
    },
    python: {
      label: 'Python',
      code: `import requests
from typing import Optional, Dict, List
import mimetypes

class DaileyMediaAPI:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "${baseUrl}/api"
        self.headers = {"X-API-Key": api_key}
    
    def upload_file(self, filepath: str) -> Dict:
        """Upload any file type to Dailey Media API"""
        # Detect MIME type
        mime_type, _ = mimetypes.guess_type(filepath)
        
        with open(filepath, 'rb') as f:
            files = {'file': (filepath, f, mime_type)}
            response = requests.post(
                f"{self.base_url}/upload",
                files=files,
                headers=self.headers
            )
        
        result = response.json()
        print(f"Uploaded: {result['file']['filename']}")
        print(f"Category: {result['file']['category']}")
        print(f"URL: {result['file']['url']}")
        
        return result
    
    def list_files(self, limit: int = 20, offset: int = 0,
                   category: Optional[str] = None) -> Dict:
        """List uploaded files with optional filtering"""
        params = {"limit": limit, "offset": offset}
        if category:
            params["category"] = category
        
        response = requests.get(
            f"{self.base_url}/files",
            params=params,
            headers=self.headers
        )
        return response.json()
    
    def get_file_by_category(self, category: str) -> List[Dict]:
        """Get all files of a specific category"""
        all_files = []
        offset = 0
        limit = 100
        
        while True:
            result = self.list_files(limit, offset, category)
            all_files.extend(result['files'])
            
            if len(result['files']) < limit:
                break
            offset += limit
        
        return all_files
    
    def delete_file(self, file_id: str) -> bool:
        """Delete a file"""
        response = requests.delete(
            f"{self.base_url}/files/{file_id}",
            headers=self.headers
        )
        return response.status_code == 200
    
    def transform_image(self, file_id: str, **options) -> str:
        """Get transformation URL for an image"""
        params = "&".join([f"{k}={v}" for k, v in options.items()])
        return f"{self.base_url}/files/{file_id}/transform?{params}"

# Usage examples
api = DaileyMediaAPI("YOUR_API_KEY")

# Upload different file types
api.upload_file("report.pdf")           # Document
api.upload_file("photo.jpg")            # Image
api.upload_file("presentation.pptx")    # Presentation
api.upload_file("data.csv")             # Data file
api.upload_file("video.mp4")            # Video
api.upload_file("archive.zip")          # Archive

# Get all documents
documents = api.get_file_by_category("documents")
for doc in documents:
    print(f"Document: {doc['filename']} ({doc['size']} bytes)")

# Get all images and create thumbnails
images = api.get_file_by_category("images")
for img in images:
    thumb_url = api.transform_image(img['id'], width=200, height=200)
    print(f"Thumbnail: {thumb_url}")`
    },
    php: {
      label: 'PHP',
      code: `<?php

class DaileyMediaAPI {
    private $apiKey;
    private $baseUrl = '${baseUrl}/api';
    
    public function __construct($apiKey) {
        $this->apiKey = $apiKey;
    }
    
    public function uploadFile($filepath) {
        $curl = curl_init();
        
        // Detect MIME type
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $filepath);
        finfo_close($finfo);
        
        $file = new CURLFile($filepath, $mimeType);
        $data = array('file' => $file);
        
        curl_setopt_array($curl, [
            CURLOPT_URL => $this->baseUrl . '/upload',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $data,
            CURLOPT_HTTPHEADER => [
                'X-API-Key: ' . $this->apiKey
            ]
        ]);
        
        $response = curl_exec($curl);
        curl_close($curl);
        
        $result = json_decode($response, true);
        
        echo "Uploaded: " . $result['file']['filename'] . "\\n";
        echo "Category: " . $result['file']['category'] . "\\n";
        echo "URL: " . $result['file']['url'] . "\\n";
        
        return $result;
    }
    
    public function listFiles($limit = 20, $offset = 0, $category = null) {
        $curl = curl_init();
        
        $params = [
            'limit' => $limit,
            'offset' => $offset
        ];
        
        if ($category) {
            $params['category'] = $category;
        }
        
        $url = $this->baseUrl . '/files?' . http_build_query($params);
        
        curl_setopt_array($curl, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'X-API-Key: ' . $this->apiKey
            ]
        ]);
        
        $response = curl_exec($curl);
        curl_close($curl);
        
        return json_decode($response, true);
    }
    
    public function handleUpload($file) {
        $result = $this->uploadFile($file);
        
        // Handle different file types
        switch($result['file']['category']) {
            case 'images':
                echo "Image uploaded - Thumbnail available\\n";
                break;
            case 'documents':
                $pages = $result['file']['metadata']['pages'] ?? 'unknown';
                echo "Document uploaded - Pages: $pages\\n";
                break;
            case 'videos':
                $duration = $result['file']['metadata']['duration'] ?? 'unknown';
                echo "Video uploaded - Duration: {$duration}s\\n";
                break;
            default:
                echo "File uploaded successfully\\n";
        }
        
        return $result;
    }
}

// Usage
$api = new DaileyMediaAPI('YOUR_API_KEY');

// Upload different types of files
$api->handleUpload('/path/to/document.pdf');
$api->handleUpload('/path/to/image.jpg');
$api->handleUpload('/path/to/video.mp4');
$api->handleUpload('/path/to/archive.zip');

// List all documents
$documents = $api->listFiles(50, 0, 'documents');
foreach ($documents['files'] as $doc) {
    echo "Document: {$doc['filename']} - Size: {$doc['size']} bytes\\n";
}

// List all images
$images = $api->listFiles(50, 0, 'images');
foreach ($images['files'] as $img) {
    echo "Image: {$img['filename']} - {$img['metadata']['width']}x{$img['metadata']['height']}\\n";
}
?>`
    },
    curl: {
      label: 'cURL',
      code: `# Upload any type of file
curl -X POST ${baseUrl}/api/upload \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "file=@/path/to/document.pdf"

# Upload multiple files of different types
curl -X POST ${baseUrl}/api/upload \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "files[]=@report.pdf" \\
  -F "files[]=@photo.jpg" \\
  -F "files[]=@data.csv" \\
  -F "files[]=@video.mp4"

# List all files
curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files?limit=20"

# List only documents
curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files?category=documents"

# List only images
curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files?category=images"

# List only videos
curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files?category=videos"

# Search for files by name
curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files?search=report"

# Get file details
curl -H "X-API-Key: YOUR_API_KEY" \\
  ${baseUrl}/api/files/file_abc123

# Delete a file
curl -X DELETE \\
  -H "X-API-Key: YOUR_API_KEY" \\
  ${baseUrl}/api/files/file_abc123

# Transform an image (resize to 800px width)
curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files/file_abc123/transform?width=800&format=webp"

# Create thumbnail (200x200)
curl -H "X-API-Key: YOUR_API_KEY" \\
  "${baseUrl}/api/files/file_abc123/transform?width=200&height=200&fit=cover"`
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Code Examples</h2>
        <p className="text-slate-600">Ready-to-use code examples for all file types in multiple languages.</p>
      </div>

      <div>
        <div className="flex space-x-2 mb-4">
          {Object.entries(examples).map(([key, example]) => (
            <button
              key={key}
              onClick={() => setSelectedLanguage(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedLanguage === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {example.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
            <code>{examples[selectedLanguage].code}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(examples[selectedLanguage].code, `code-${selectedLanguage}`)}
            className="absolute top-2 right-2 p-2 hover:bg-slate-800 rounded transition-colors"
          >
            {copiedText === `code-${selectedLanguage}` ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function LimitsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Limits & Quotas</h2>
        <p className="text-slate-600">Understanding API limits and best practices.</p>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-900 mb-3">File Limits</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-slate-600">Maximum file size:</span>
              <span className="font-medium text-slate-900">100MB</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-600">Supported formats:</span>
              <span className="font-medium text-slate-900">ALL file types</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-600">Batch upload limit:</span>
              <span className="font-medium text-slate-900">10 files</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-600">Storage per user:</span>
              <span className="font-medium text-slate-900">10GB</span>
            </li>
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-900 mb-3">API Rate Limits</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-slate-600">Requests per minute:</span>
              <span className="font-medium text-slate-900">60</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-600">Uploads per hour:</span>
              <span className="font-medium text-slate-900">100</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-600">Bandwidth per day:</span>
              <span className="font-medium text-slate-900">10GB</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-600">Transformations per hour:</span>
              <span className="font-medium text-slate-900">500</span>
            </li>
          </ul>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-900 mb-2">⚡ Performance Tips</h3>
          <ul className="space-y-1 text-sm text-yellow-800">
            <li>• Use batch uploads for multiple files</li>
            <li>• Cache transformed images on your CDN</li>
            <li>• Use pagination for large file lists</li>
            <li>• Implement exponential backoff for retries</li>
            <li>• Store file IDs in your database for quick access</li>
            <li>• Use appropriate file categories for better organization</li>
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">🎯 Best Practices</h3>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>• Validate file types before uploading</li>
            <li>• Compress large files when possible</li>
            <li>• Use metadata for searchability</li>
            <li>• Implement proper error handling</li>
            <li>• Monitor your usage via API keys dashboard</li>
            <li>• Use webhooks for async processing (coming soon)</li>
          </ul>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-900 mb-2">🚫 Prohibited Content</h3>
          <p className="text-sm text-red-800">
            The following content is strictly prohibited:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            <li>• Illegal or harmful content</li>
            <li>• Malware, viruses, or malicious code</li>
            <li>• Copyright-infringing material</li>
            <li>• Content violating privacy rights</li>
            <li>• Spam or abusive content</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function SDKsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">SDKs & Libraries</h2>
        <p className="text-slate-600">Official and community SDKs for the Dailey Media API.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">📦</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">JavaScript/TypeScript</h3>
              <p className="text-xs text-slate-500">Official SDK</p>
            </div>
          </div>
          <pre className="bg-slate-100 px-3 py-2 rounded text-sm mb-3">
            <code>npm install @dailey/media-api</code>
          </pre>
          <a href="#" className="text-sm text-blue-600 hover:text-blue-700">View on npm →</a>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">🐍</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Python</h3>
              <p className="text-xs text-slate-500">Official SDK</p>
            </div>
          </div>
          <pre className="bg-slate-100 px-3 py-2 rounded text-sm mb-3">
            <code>pip install dailey-media</code>
          </pre>
          <a href="#" className="text-sm text-blue-600 hover:text-blue-700">View on PyPI →</a>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">🐘</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">PHP</h3>
              <p className="text-xs text-slate-500">Community SDK</p>
            </div>
          </div>
          <pre className="bg-slate-100 px-3 py-2 rounded text-sm mb-3">
            <code>composer require dailey/media-api</code>
          </pre>
          <a href="#" className="text-sm text-blue-600 hover:text-blue-700">View on Packagist →</a>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">🚀</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Go</h3>
              <p className="text-xs text-slate-500">Coming Soon</p>
            </div>
          </div>
          <pre className="bg-slate-100 px-3 py-2 rounded text-sm mb-3">
            <code>go get github.com/dailey/media-api-go</code>
          </pre>
          <span className="text-sm text-slate-400">In development</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">💎</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Ruby</h3>
              <p className="text-xs text-slate-500">Coming Soon</p>
            </div>
          </div>
          <pre className="bg-slate-100 px-3 py-2 rounded text-sm mb-3">
            <code>gem install dailey-media</code>
          </pre>
          <span className="text-sm text-slate-400">In development</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">☕</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Java</h3>
              <p className="text-xs text-slate-500">Coming Soon</p>
            </div>
          </div>
          <pre className="bg-slate-100 px-3 py-2 rounded text-sm mb-3">
            <code>com.dailey:media-api:1.0.0</code>
          </pre>
          <span className="text-sm text-slate-400">In development</span>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <h3 className="font-semibold text-blue-900 mb-2">🛠️ Building Your Own SDK?</h3>
        <p className="text-sm text-blue-800 mb-3">
          We welcome community contributions! If you're building an SDK for a language we don't support yet:
        </p>
        <ul className="space-y-1 text-sm text-blue-800">
          <li>• Follow our API design guidelines</li>
          <li>• Support all file types, not just images</li>
          <li>• Include comprehensive error handling</li>
          <li>• Add retry logic with exponential backoff</li>
          <li>• Implement proper file type detection</li>
          <li>• Submit your SDK for review to get listed here</li>
        </ul>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-semibold text-green-900 mb-2">✨ SDK Features</h3>
        <p className="text-sm text-green-800 mb-3">
          All official SDKs include:
        </p>
        <ul className="space-y-1 text-sm text-green-800">
          <li>• Automatic file type detection</li>
          <li>• Built-in retry logic</li>
          <li>• Progress tracking for uploads</li>
          <li>• Streaming support for large files</li>
          <li>• TypeScript/Type definitions</li>
          <li>• Comprehensive documentation</li>
          <li>• Example applications</li>
        </ul>
      </div>
    </div>
  )
}