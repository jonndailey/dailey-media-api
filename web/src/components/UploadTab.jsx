import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Upload, X, CheckCircle, AlertCircle, FileImage, Loader2, ChevronDown, Lock, Globe, Search, Folder } from 'lucide-react'
import { formatBytes } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

export default function UploadTab() {
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [supportedFormats, setSupportedFormats] = useState(null)
  const [buckets, setBuckets] = useState([])
  const [selectedBucket, setSelectedBucket] = useState(null)
  const [folderPath, setFolderPath] = useState('')
  const [bucketPickerOpen, setBucketPickerOpen] = useState(false)
  const [bucketSearch, setBucketSearch] = useState('')
  const fileInputRef = useRef(null)
  
  const { makeAuthenticatedRequest } = useAuth()

  // Load supported formats and buckets on component mount
  useEffect(() => {
    // Load supported formats
    fetch('/api/upload/formats')
      .then(res => res.json())
      .then(data => setSupportedFormats(data.formats))
      .catch(console.error)
    
    // Load buckets
    fetchBuckets()
  }, [])
  
  const fetchBuckets = async () => {
    try {
      const response = await makeAuthenticatedRequest('/api/buckets')
      const data = await response.json()
      const bucketList = data.buckets || []
      setBuckets(bucketList)
      if (bucketList.length > 0) {
        setSelectedBucket((current) => {
          if (current && bucketList.some((bucket) => bucket.id === current)) {
            return current
          }
          return bucketList[0].id
        })
      }
    } catch (err) {
      console.error('Error fetching buckets:', err)
    }
  }

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
        const bucketId = selectedBucket || 'default'
        formData.append('bucket_id', bucketId)
        if (folderPath.trim()) {
          formData.append('folder_path', folderPath.trim())
        }

        const response = await makeAuthenticatedRequest('/api/upload', {
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
      
      {/* Bucket Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Upload to Bucket
        </label>
        <div className="space-y-2">
          <RecentBucketPicker
            buckets={buckets}
            selectedBucket={selectedBucket}
            onSelect={setSelectedBucket}
            onOpenMore={() => setBucketPickerOpen(true)}
          />
          <ActiveBucketSummary bucket={buckets.find(b => b.id === selectedBucket)} />
          <p className="text-xs text-slate-500">
            Choose a bucket for this upload. Private buckets keep files internal; public buckets issue shareable links. Create new buckets in the Buckets tab.
          </p>
        </div>
      </div>
      
      {/* Folder Path */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Folder Path (optional)
        </label>
        <input
          type="text"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="e.g., sm, lg/thumbnails, variants/mobile"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="text-xs text-slate-500">
          Specify a folder path within the bucket to organize your files. Use forward slashes (/) for nested folders.
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
              <strong>Supported:</strong> {Object.keys(supportedFormats).slice(0, 4).join(', ').toUpperCase()}
            </div>
            <div>
              <strong>All formats:</strong> Images, Videos, Documents, Archives and more
            </div>
          </div>
        )}
      </div>

      {bucketPickerOpen && (
        <BucketOverlay
          buckets={buckets}
          selectedBucket={selectedBucket}
          onSelect={(id) => {
            setSelectedBucket(id)
            setBucketPickerOpen(false)
            setBucketSearch('')
          }}
          onClose={() => {
            setBucketPickerOpen(false)
            setBucketSearch('')
          }}
          search={bucketSearch}
          onSearch={setBucketSearch}
        />
      )}

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
                      
                      {fileItem.status === 'success' && fileItem.result && fileItem.result.file && (
                        <div className="mt-2 space-y-1">
                          {(() => {
                            const original = fileItem.result.file.original
                            const accessUrl = original?.url || original?.signedUrl
                            if (!accessUrl) return null
                            const accessLabel = original?.url ? 'Public URL' : 'Signed URL'
                            return (
                              <div className="text-sm break-all">
                                <span className="font-medium">{accessLabel}:</span> {accessUrl}
                              </div>
                            )
                          })()}
                          {fileItem.result.file.original?.access && (
                            <div className="text-sm">
                              <span className="font-medium">Access:</span> {fileItem.result.file.original.access === 'public' ? 'Public' : 'Private'}
                            </div>
                          )}
                          {fileItem.result.file.variants && (
                            <div className="text-sm">
                              <span className="font-medium">Variants:</span> {fileItem.result.file.variants.length} generated
                            </div>
                          )}
                          {fileItem.result.file.metadata?.formatInfo?.originalFormat && (
                            <div className="text-sm">
                              <span className="font-medium">Format:</span> {fileItem.result.file.metadata.formatInfo.originalFormat}
                            </div>
                          )}
                          {fileItem.result.file.metadata?.width && (
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

      {/* Authentication Status */}
      <div className="border rounded-lg p-4 bg-muted/50">
        <h3 className="font-medium mb-3">Authentication Status</h3>
        <div className="text-sm">
          <div className="flex items-center text-green-600">
            <CheckCircle className="w-4 h-4 mr-2" />
            <span>Authenticated with DAILEY CORE</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Files are uploaded using your authenticated DAILEY CORE credentials and associated with your user account.
        </p>
      </div>
    </div>
  )
}

function RecentBucketPicker({ buckets, selectedBucket, onSelect, onOpenMore }) {
  const sortedBuckets = [...(buckets || [])].sort((a, b) => {
    const left = new Date(a.updated_at || a.created_at || 0).getTime()
    const right = new Date(b.updated_at || b.created_at || 0).getTime()
    return right - left
  })

  const recentBuckets = sortedBuckets.slice(0, 5)

  if (!recentBuckets.length) {
    return (
      <div className="flex items-center space-x-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Folder className="h-4 w-4" />
        <span>No buckets available yet. Uploads will fall back to the default bucket.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {recentBuckets.map((bucket) => {
        const isActive = bucket.id === selectedBucket
        return (
          <button
            key={bucket.id}
            type="button"
            onClick={() => onSelect(bucket.id)}
            className={`flex items-center space-x-2 rounded-full border px-4 py-2 text-sm transition-colors ${
              isActive
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-600'
            }`}
          >
            <span className="font-medium">{bucket.name}</span>
            <BucketVisibilityBadge isPublic={bucket.is_public} subtle={!isActive} />
          </button>
        )
      })}
      {sortedBuckets.length > 5 && (
        <button
          type="button"
          onClick={onOpenMore}
          className="flex items-center space-x-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:border-blue-400 hover:text-blue-600"
        >
          <ChevronDown className="h-4 w-4" />
          <span>More buckets</span>
        </button>
      )}
    </div>
  )
}

function ActiveBucketSummary({ bucket }) {
  if (!bucket) {
    return (
      <div className="flex items-center space-x-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Folder className="h-4 w-4" />
        <span>No custom bucket selected. Files will upload to the default private bucket.</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <div>
        <p className="font-medium text-slate-800">{bucket.name}</p>
        <p className="text-xs text-slate-500">
          {bucket.description || 'No description provided'}
        </p>
      </div>
      <div className="flex items-center space-x-3">
        <BucketVisibilityBadge isPublic={bucket.is_public} />
        <div className="text-xs text-slate-500">
          {bucket.file_count || 0} files
        </div>
      </div>
    </div>
  )
}

function BucketOverlay({ buckets, selectedBucket, onSelect, onClose, search, onSearch }) {
  if (typeof document === 'undefined') {
    return null
  }

  const sortedBuckets = [...(buckets || [])].sort((a, b) => {
    const left = new Date(a.updated_at || a.created_at || 0).getTime()
    const right = new Date(b.updated_at || b.created_at || 0).getTime()
    return right - left
  })

  const filteredBuckets = sortedBuckets.filter((bucket) =>
    bucket.name.toLowerCase().includes((search || '').toLowerCase())
  )

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Select a bucket</h3>
              <p className="text-sm text-slate-500">
                Choose from all available buckets. Private buckets restrict access to authenticated users only.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close bucket picker"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="px-5 py-3">
            <div className="flex items-center space-x-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search buckets"
                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto px-3 pb-4">
            {filteredBuckets.length === 0 ? (
              <div className="flex flex-col items-center space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                <Folder className="h-8 w-8 text-slate-300" />
                <p>No buckets match your search.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredBuckets.map((bucket) => {
                  const isActive = bucket.id === selectedBucket
                  return (
                    <button
                      key={bucket.id}
                      type="button"
                      onClick={() => onSelect(bucket.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        isActive
                          ? 'border-blue-600 bg-blue-600/10 text-blue-700 shadow-sm'
                          : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{bucket.name}</p>
                          <p className="text-xs text-slate-500">
                            {bucket.description || 'No description provided'}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-slate-500">
                          <BucketVisibilityBadge isPublic={bucket.is_public} subtle />
                          <span>{bucket.file_count || 0} files</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <footer className="border-t border-slate-200 px-5 py-3 text-sm text-slate-500">
            Need a new bucket? Head to the <span className="font-medium text-slate-700">Buckets &amp; Files</span> tab to create public or private storage buckets.
          </footer>
        </div>
      </div>
    </div>,
    document.body
  )
}

function BucketVisibilityBadge({ isPublic, subtle = false }) {
  const Icon = isPublic ? Globe : Lock
  const baseClasses = subtle
    ? 'inline-flex items-center space-x-1 rounded-full border px-2 py-0.5 text-[11px]'
    : 'inline-flex items-center space-x-1 rounded-full border px-2.5 py-0.5 text-xs'
  const palette = isPublic
    ? subtle
      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
      : 'border-emerald-300 bg-emerald-100 text-emerald-700'
    : subtle
      ? 'border-amber-200 bg-amber-50 text-amber-600'
      : 'border-amber-300 bg-amber-100 text-amber-700'

  return (
    <span className={`${baseClasses} ${palette}`}>
      <Icon className={subtle ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span>{isPublic ? 'Public' : 'Private'}</span>
    </span>
  )
}
