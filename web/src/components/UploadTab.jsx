import { useState, useRef } from 'react'
import { Upload, X, CheckCircle, AlertCircle, FileImage, Loader2 } from 'lucide-react'
import { formatBytes } from '../lib/utils'

export default function UploadTab() {
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [supportedFormats, setSupportedFormats] = useState(null)
  const fileInputRef = useRef(null)

  // Load supported formats on component mount
  useState(() => {
    fetch('/api/upload/formats')
      .then(res => res.json())
      .then(data => setSupportedFormats(data.formats))
      .catch(console.error)
  }, [])

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleFileSelect = (e) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files))
    }
  }

  const handleFiles = async (files) => {
    setUploading(true)
    
    for (const file of files) {
      const fileId = Date.now() + Math.random()
      
      // Add file to list with pending status
      setUploadedFiles(prev => [...prev, {
        id: fileId,
        file,
        status: 'uploading',
        progress: 0,
        result: null
      }])

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('user_id', 'demo_user')
        formData.append('app_id', 'dailey_media_web')

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        })

        const result = await response.json()

        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { ...f, status: result.success ? 'success' : 'error', result }
            : f
        ))
      } catch (error) {
        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { ...f, status: 'error', result: { error: error.message } }
            : f
        ))
      }
    }
    
    setUploading(false)
  }

  const removeFile = (id) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearAll = () => {
    setUploadedFiles([])
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Upload Media Files</h2>
        <p className="text-muted-foreground">
          Upload and process images with automatic variant generation. Supports RAW, HEIC, TIFF, and standard formats.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${dragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-primary/50'
          }
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">
          Drop files here or click to select
        </h3>
        <p className="text-muted-foreground mb-4">
          Supports images up to 100MB each
        </p>
        
        {supportedFormats && (
          <div className="text-xs text-muted-foreground">
            <div className="mb-2">
              <strong>Professional:</strong> {Object.keys(supportedFormats.professional).join(', ').toUpperCase()}
            </div>
            <div>
              <strong>Standard:</strong> {Object.keys(supportedFormats.standard).join(', ').toUpperCase()}
            </div>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Uploaded Files</h3>
            <button
              onClick={clearAll}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-3">
            {uploadedFiles.map((fileItem) => (
              <div key={fileItem.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <FileImage className="h-8 w-8 text-muted-foreground mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{fileItem.file.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatBytes(fileItem.file.size)}
                      </div>
                      
                      {fileItem.status === 'success' && fileItem.result && (
                        <div className="mt-2 space-y-1">
                          <div className="text-sm">
                            <span className="font-medium">Original:</span> {fileItem.result.file.original.url}
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">Variants:</span> {fileItem.result.file.variants.length} generated
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">Format:</span> {fileItem.result.file.metadata.formatInfo.originalFormat}
                          </div>
                          {fileItem.result.file.metadata.width && (
                            <div className="text-sm">
                              <span className="font-medium">Dimensions:</span> {fileItem.result.file.metadata.width} × {fileItem.result.file.metadata.height}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {fileItem.status === 'error' && fileItem.result && (
                        <div className="mt-2 text-sm text-red-600">
                          Error: {fileItem.result.error || 'Upload failed'}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {fileItem.status === 'uploading' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    {fileItem.status === 'success' && (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                    {fileItem.status === 'error' && (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <button
                      onClick={() => removeFile(fileItem.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Settings */}
      <div className="border rounded-lg p-4 bg-muted/50">
        <h3 className="font-medium mb-3">Test Settings</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">User ID:</span> demo_user
          </div>
          <div>
            <span className="font-medium">App ID:</span> dailey_media_web
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          These are demo values. In production, these would be provided by your authentication system.
        </p>
      </div>
    </div>
  )
}