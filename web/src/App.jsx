import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import * as Tabs from '@radix-ui/react-tabs'
import DocsTab from './components/DocsTab.jsx'
import UploadTab from './components/UploadTab.jsx'
import StatsTab from './components/StatsTab.jsx'
import ApiKeysTab from './components/ApiKeysTab.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginForm from './components/LoginForm'
import { Upload, Folder, BarChart3, BookOpen, KeyRound, FolderOpen, Image, FileText, Package, Eye, Zap, Plus, Settings, ArrowLeft, ChevronRight, MoreVertical, Download, Info, ExternalLink, Copy, X, ArrowUpDown, Trash2 } from 'lucide-react'

// Main authenticated app content
function AuthenticatedApp() {
  const [activeTab, setActiveTab] = useState('upload')
  const [error, setError] = useState(null)
  const { user, logout, isAdmin, canViewAnalytics } = useAuth()

  // Simple error boundary
  useEffect(() => {
    const handleError = (event) => {
      console.error('App error:', event.error)
      setError(event.error?.message || 'An error occurred')
    }
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg">
          <h1 className="text-xl font-bold text-red-600 mb-2">Application Error</h1>
          <p className="text-gray-700">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src="/android-chrome-192x192.png" 
                alt="Dailey Media API Logo" 
                className="w-16 h-16"
              />
              <div>
                <h1 className="text-xl font-bold text-slate-900">Dailey Media API</h1>
                <p className="text-sm text-slate-600">Professional Media Processing Platform</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-sm text-slate-600">
                Welcome, <span className="font-medium">{user?.name || user?.email}</span>
              </div>
              <button 
                onClick={logout}
                className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1 rounded border border-slate-300 hover:border-slate-400 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200/60">
          <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
            <Tabs.List className="flex border-b border-slate-200">
              <Tabs.Trigger 
                value="upload" 
                className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
              >
                <Upload className="w-4 h-4 inline mr-2" />
                Upload Files
              </Tabs.Trigger>
              <Tabs.Trigger 
                value="buckets" 
                className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
              >
                <Folder className="w-4 h-4 inline mr-2" />
                Buckets & Files
              </Tabs.Trigger>
              {canViewAnalytics() && (
                <Tabs.Trigger 
                  value="stats" 
                  className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
                >
                  <BarChart3 className="w-4 h-4 inline mr-2" />
                  Analytics
                </Tabs.Trigger>
              )}
              <Tabs.Trigger 
                value="docs" 
                className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
              >
                <BookOpen className="w-4 h-4 inline mr-2" />
                Documentation
              </Tabs.Trigger>
              <Tabs.Trigger 
                value="keys" 
                className="flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600"
              >
                <KeyRound className="w-4 h-4 inline mr-2" />
                API Keys
              </Tabs.Trigger>
            </Tabs.List>

            <div className="p-6">
              <Tabs.Content value="upload">
                <UploadTab />
              </Tabs.Content>
              
              <Tabs.Content value="buckets">
                <BucketsSection />
              </Tabs.Content>
              
              {canViewAnalytics() && (
                <Tabs.Content value="stats">
                  <StatsTab />
                </Tabs.Content>
              )}
              
              <Tabs.Content value="docs">
                <DocsTab />
              </Tabs.Content>
              
              <Tabs.Content value="keys">
                <ApiKeysTab />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </div>
      </main>
    </div>
  )
}


// Simple Stats Section  
// Enhanced Buckets & Files Management Section
function BucketsSection() {
  const [buckets, setBuckets] = useState([])
  const [currentView, setCurrentView] = useState('buckets') // 'buckets' or 'files'
  const [selectedBucket, setSelectedBucket] = useState(null)
  const [currentPath, setCurrentPath] = useState('') // For nested folders
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')
  const [newBucketDescription, setNewBucketDescription] = useState('')
  const [newBucketIsPublic, setNewBucketIsPublic] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [copiedField, setCopiedField] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [fileToDelete, setFileToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const closeTimeoutRef = useRef(null)
  const previewCloseTimeoutRef = useRef(null)
  const originalOverflowRef = useRef(null)
  const { makeAuthenticatedRequest } = useAuth()
  
  useEffect(() => {
    if (currentView === 'buckets') {
      fetchBuckets()
    } else if (currentView === 'files' && selectedBucket) {
      fetchBucketFiles(selectedBucket.id, currentPath)
    }
  }, [currentView, selectedBucket, currentPath])
  
  useEffect(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current)
      previewCloseTimeoutRef.current = null
    }
    setIsDetailsOpen(false)
    setSelectedFile(null)
    setCopiedField(null)
    setIsPreviewOpen(false)
    setPreviewFile(null)
    setPreviewLoading(false)
    setPreviewError(null)
  }, [currentView, currentPath, selectedBucket])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
      if (previewCloseTimeoutRef.current) {
        clearTimeout(previewCloseTimeoutRef.current)
        previewCloseTimeoutRef.current = null
      }
      if (originalOverflowRef.current !== null && typeof document !== 'undefined') {
        document.body.style.overflow = originalOverflowRef.current
        originalOverflowRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const shouldLock = isDetailsOpen || isPreviewOpen
    if (shouldLock) {
      if (originalOverflowRef.current === null) {
        originalOverflowRef.current = document.body.style.overflow
      }
      document.body.style.overflow = 'hidden'
    } else if (originalOverflowRef.current !== null) {
      document.body.style.overflow = originalOverflowRef.current
      originalOverflowRef.current = null
    }
  }, [isDetailsOpen, isPreviewOpen])

  const getFileAccessUrl = (file) => {
    if (!file) return null
    return file.accessUrl || file.public_url || file.signed_url || file.url || file.signedUrl || null
  }

  const getAccessTypeLabel = (file) => {
    if (file?.access === 'public' || file?.public_url) return 'Public'
    if (file?.access === 'private' || file?.signed_url || file?.signedUrl) return 'Private'
    return 'Restricted'
  }

  const CATEGORY_LABELS = {
    all: 'All',
    folders: 'Folders',
    images: 'Images',
    videos: 'Videos',
    audio: 'Audio',
    documents: 'Documents',
    archives: 'Archives',
    code: 'Code',
    data: 'Data',
    other: 'Other'
  }

  const getFileCategory = (file) => {
    if (!file || file.is_folder) {
      return 'folders'
    }

    const mime = (file.mime_type || file.metadata?.mimeType || '').toLowerCase()
    const name = (file.original_filename || file.name || file.id || '').toLowerCase()
    const extension = name.includes('.') ? name.split('.').pop() : ''

    if (mime.startsWith('image/')) return 'images'
    if (mime.startsWith('video/')) return 'videos'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.includes('pdf') || mime.includes('word') || mime.includes('excel') || mime.includes('powerpoint') || mime.includes('text') || mime.includes('document')) return 'documents'
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || mime.includes('archive')) return 'archives'
    if (mime.includes('json') || mime.includes('xml') || mime.includes('csv')) return 'data'
    if (mime.includes('javascript') || mime.includes('typescript') || mime.includes('python') || mime.includes('application/x-sh') || mime.includes('text/x-')) return 'code'

    if (extension) {
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tiff', 'bmp', 'svg'].includes(extension)) return 'images'
      if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension)) return 'videos'
      if (['mp3', 'wav', 'aac', 'flac', 'ogg'].includes(extension)) return 'audio'
      if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'md'].includes(extension)) return 'documents'
      if (['zip', 'rar', 'tar', 'gz', '7z'].includes(extension)) return 'archives'
      if (['json', 'xml', 'csv', 'yml', 'yaml'].includes(extension)) return 'data'
      if (['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'java', 'c', 'cpp', 'go', 'cs', 'php', 'html', 'css'].includes(extension)) return 'code'
    }

    return 'other'
  }

  const typeOptions = useMemo(() => {
    const categories = new Set(['all'])
    files.forEach((file) => {
      categories.add(getFileCategory(file))
    })

    return Array.from(categories).map((value) => ({
      value,
      label: CATEGORY_LABELS[value] || value.charAt(0).toUpperCase() + value.slice(1)
    }))
  }, [files])

  useEffect(() => {
    if (!typeOptions.some((option) => option.value === typeFilter)) {
      setTypeFilter('all')
    }
  }, [typeOptions, typeFilter])

  const filteredFiles = useMemo(() => {
    if (typeFilter === 'all') return files
    return files.filter((file) => getFileCategory(file) === typeFilter)
  }, [files, typeFilter])

  const displayFiles = useMemo(() => {
    const directionMultiplier = sortDirection === 'asc' ? 1 : -1
    const sorted = [...filteredFiles].sort((a, b) => {
      if (a.is_folder && !b.is_folder) return -1
      if (!a.is_folder && b.is_folder) return 1

      const valueFor = (file) => {
        switch (sortField) {
          case 'size':
            return file.file_size || 0
          case 'updated':
            return new Date(file.uploaded_at || file.updated_at || file.created_at || 0).getTime()
          case 'type':
            return getFileCategory(file)
          case 'name':
          default:
            return (file.original_filename || file.name || file.id || '').toLowerCase()
        }
      }

      const left = valueFor(a)
      const right = valueFor(b)

      if (typeof left === 'string' && typeof right === 'string') {
        if (left < right) return -1 * directionMultiplier
        if (left > right) return 1 * directionMultiplier
        return 0
      }

      return (left - right) * directionMultiplier
    })

    return sorted
  }, [filteredFiles, sortField, sortDirection])

  const sortOptions = useMemo(() => ([
    { value: 'name', label: 'Name' },
    { value: 'size', label: 'Size' },
    { value: 'updated', label: 'Last Modified' },
    { value: 'type', label: 'Type' }
  ]), [])

  const fetchBuckets = async () => {
    try {
      setLoading(true)
      const response = await makeAuthenticatedRequest('/api/buckets')
      const data = await response.json()
      setBuckets(data.buckets || [])
    } catch (err) {
      setError(err.message)
      console.error('Error fetching buckets:', err)
    } finally {
      setLoading(false)
    }
  }
  
  const fetchBucketFiles = async (bucketId, path = '') => {
    try {
      setLoading(true)
      const url = path 
        ? `/api/buckets/${bucketId}/files?path=${encodeURIComponent(path)}`
        : `/api/buckets/${bucketId}/files`
      const response = await makeAuthenticatedRequest(url)
      const data = await response.json()
      setFiles(data.files || [])
    } catch (err) {
      setError(err.message)
      console.error('Error fetching files:', err)
    } finally {
      setLoading(false)
    }
  }
  
  const createBucket = async (e) => {
    e.preventDefault()
    if (!newBucketName.trim()) return
    
    try {
      setCreating(true)
      const response = await makeAuthenticatedRequest('/api/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBucketName.trim(),
          description: newBucketDescription.trim(),
          is_public: newBucketIsPublic
        })
      })
      
      if (response.ok) {
        setNewBucketName('')
        setNewBucketDescription('')
        setNewBucketIsPublic(false)
        setShowCreateForm(false)
        fetchBuckets()
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to create bucket')
      }
    } catch (err) {
      console.error('Error creating bucket:', err)
      alert('Failed to create bucket')
    } finally {
      setCreating(false)
    }
  }
  
  const createFolder = async (e) => {
    e.preventDefault()
    if (!newFolderName.trim() || !selectedBucket) return
    
    try {
      setCreating(true)
      const folderPath = currentPath ? `${currentPath}/${newFolderName.trim()}` : newFolderName.trim()
      const response = await makeAuthenticatedRequest(`/api/buckets/${selectedBucket.id}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: folderPath
        })
      })
      
      if (response.ok) {
        setNewFolderName('')
        setShowCreateFolder(false)
        fetchBucketFiles(selectedBucket.id, currentPath)
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to create folder')
      }
    } catch (err) {
      console.error('Error creating folder:', err)
      alert('Failed to create folder')
    } finally {
      setCreating(false)
    }
  }
  
  const openBucket = (bucket) => {
    setSelectedBucket(bucket)
    setCurrentPath('')
    setCurrentView('files')
  }
  
  const navigateToFolder = (folderName) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName
    setCurrentPath(newPath)
  }
  
  const navigateUp = () => {
    if (currentPath.includes('/')) {
      const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
      setCurrentPath(parentPath)
    } else if (currentPath) {
      setCurrentPath('')
    } else {
      setCurrentView('buckets')
      setSelectedBucket(null)
    }
  }
  
  const getFileTypeIcon = (mimeType, isFolder = false) => {
    if (isFolder) return <Folder className="w-6 h-6 text-blue-600" />
    if (mimeType.startsWith('image/')) return <Image className="w-6 h-6 text-green-600" />
    if (mimeType.startsWith('video/')) return <Package className="w-6 h-6 text-purple-600" />
    if (mimeType.startsWith('audio/')) return <Zap className="w-6 h-6 text-orange-600" />
    return <FileText className="w-6 h-6 text-slate-600" />
  }
  
  const isImageFile = (file) => {
    const mime = file?.mime_type || file?.metadata?.mimeType
    return typeof mime === 'string' && mime.startsWith('image/')
  }
  
  const formatFileSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—'
    if (bytes === 0) return '0 Bytes'
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
    const value = bytes / Math.pow(1024, index)
    return `${Math.round(value * 100) / 100} ${sizes[index]}`
  }
  
  const formatDateTime = (value) => {
    if (!value) return '—'
    try {
      const date = typeof value === 'string' ? new Date(value) : value
      if (Number.isNaN(date.getTime())) return '—'
      return date.toLocaleString()
    } catch {
      return '—'
    }
  }
  
  const copyToClipboard = async (value, fieldKey) => {
    if (!value) return
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
      await navigator.clipboard.writeText(value)
      setCopiedField(fieldKey)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Failed to copy value', err)
    }
  }
  
  const openFileDetails = (file) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current)
      previewCloseTimeoutRef.current = null
    }
    if (previewFile || isPreviewOpen) {
      closePreview(true)
    }
    setCopiedField(null)
    setSelectedFile(file)
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => setIsDetailsOpen(true))
    } else {
      setIsDetailsOpen(true)
    }
  }
  
  const closeFileDetails = () => {
    setCopiedField(null)
    setIsDetailsOpen(false)
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }
    closeTimeoutRef.current = setTimeout(() => {
      setSelectedFile(null)
      closeTimeoutRef.current = null
    }, 300)
  }

  const openPreview = (file) => {
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current)
      previewCloseTimeoutRef.current = null
    }
    if (selectedFile) {
      closeFileDetails()
    }
    const accessUrl = getFileAccessUrl(file)
    setPreviewError(null)
    setPreviewLoading(!!accessUrl)
    setPreviewFile({ ...file, accessUrl })
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => setIsPreviewOpen(true))
    } else {
      setIsPreviewOpen(true)
    }
    if (!accessUrl) {
      setPreviewLoading(false)
      setPreviewError('Preview is only available after an access URL is generated for the file.')
    }
  }

  const closePreview = (immediate = false) => {
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current)
      previewCloseTimeoutRef.current = null
    }
    if (immediate) {
      setIsPreviewOpen(false)
      setPreviewFile(null)
      setPreviewLoading(false)
      setPreviewError(null)
      return
    }
    setIsPreviewOpen(false)
    previewCloseTimeoutRef.current = setTimeout(() => {
      setPreviewFile(null)
      setPreviewLoading(false)
      setPreviewError(null)
      previewCloseTimeoutRef.current = null
    }, 300)
  }

  const handleDeleteFile = (file) => {
    setFileToDelete(file)
  }

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return
    
    setIsDeleting(true)
    try {
      await makeAuthenticatedRequest(`/api/buckets/${selectedBucket.id}/files/${fileToDelete.id}`, {
        method: 'DELETE'
      })
      
      // Remove the file from the current files list
      setFiles(prevFiles => prevFiles.filter(f => f.id !== fileToDelete.id))
      
      // Close any open modals for this file
      if (selectedFile?.id === fileToDelete.id) {
        closeFileDetails()
      }
      if (previewFile?.id === fileToDelete.id) {
        closePreview(true)
      }
      
    } catch (error) {
      console.error('Failed to delete file:', error)
      setError(`Failed to delete file: ${error.message}`)
    } finally {
      setIsDeleting(false)
      setFileToDelete(null)
    }
  }

  const cancelDeleteFile = () => {
    setFileToDelete(null)
  }

  const detailsPortal = (typeof document !== 'undefined' && selectedFile)
    ? createPortal(
        (
          <div className="fixed inset-0 z-50">
            <div
              className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-300 ${isDetailsOpen ? 'opacity-100 backdrop-blur-md pointer-events-auto' : 'opacity-0 backdrop-blur-none pointer-events-none'}`}
              onClick={closeFileDetails}
            />
            <div
              className={`absolute inset-y-0 right-0 w-full max-w-xl bg-white border-l border-slate-200 transform transition-all duration-300 ease-in-out ${
                isDetailsOpen ? 'translate-x-0 shadow-2xl pointer-events-auto' : 'translate-x-full shadow-none pointer-events-none'
              } flex flex-col h-full`}
            >
              <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {selectedFile?.original_filename || selectedFile?.name}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedFile?.is_folder ? 'Folder' : (selectedFile?.mime_type || selectedFile?.metadata?.mimeType || 'Unknown type')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeFileDetails}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-6 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">File size</p>
                    <p className="mt-1 text-slate-800">
                      {selectedFile?.is_folder ? '—' : formatFileSize(selectedFile?.file_size)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</p>
                    <p className="mt-1 text-slate-800">
                      {formatDateTime(selectedFile?.uploaded_at || selectedFile?.updated_at || selectedFile?.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {selectedFile?.is_folder ? 'Folder path' : 'Location'}
                    </p>
                    <p className="mt-1 text-slate-800">
                      {selectedFile?.folder_path ? selectedFile?.folder_path : 'Root'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bucket</p>
                    <p className="mt-1 text-slate-800">
                      {selectedFile?.bucket_id || selectedBucket?.id || selectedBucket?.name}
                    </p>
                  </div>
                  {selectedFile?.is_folder && typeof selectedFile?.file_count === 'number' && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items</p>
                      <p className="mt-1 text-slate-800">{selectedFile.file_count}</p>
                    </div>
                  )}
                  {selectedFile?.created_at && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-1 text-slate-800">
                        {formatDateTime(selectedFile.created_at)}
                      </p>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Storage key</p>
                    <div className="mt-1 flex flex-col md:flex-row md:items-center md:space-x-3 space-y-2 md:space-y-0">
                      <span className="text-slate-800 break-all md:flex-1">{selectedFile?.storage_key || '—'}</span>
                      {selectedFile?.storage_key && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedFile.storage_key, 'storageKey')}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          {copiedField === 'storageKey' ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {!selectedFile?.is_folder && getFileAccessUrl(selectedFile) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between md:space-x-4 space-y-2 md:space-y-0">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{getAccessTypeLabel(selectedFile)} URL</p>
                        <p className="text-xs text-slate-500 break-all mt-1">{getFileAccessUrl(selectedFile)}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <a
                          href={getFileAccessUrl(selectedFile)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(getFileAccessUrl(selectedFile), 'accessUrl')}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          {copiedField === 'accessUrl' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selectedFile?.metadata && Object.keys(selectedFile.metadata).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">File metadata</h4>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 overflow-x-auto">
                      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(selectedFile.metadata, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ),
        document.body
      )
    : null

  const previewPortal = (typeof document !== 'undefined' && previewFile)
    ? createPortal(
        (
          <div className="fixed inset-0 z-[60]">
            <div
              className={`absolute inset-0 bg-slate-900/70 transition-opacity duration-300 ${isPreviewOpen ? 'opacity-100 backdrop-blur-md pointer-events-auto' : 'opacity-0 backdrop-blur-none pointer-events-none'}`}
              onClick={() => closePreview()}
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div
                className={`relative w-full max-w-3xl max-h-[92vh] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 ease-out pointer-events-auto ${
                  isPreviewOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-3'
                } flex flex-col`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {previewFile?.original_filename || previewFile?.name || 'Preview'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {previewFile?.mime_type || previewFile?.metadata?.mimeType || 'image/*'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {previewFile?.accessUrl && (
                      <a
                        href={previewFile.accessUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Open in New Tab
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => closePreview()}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="bg-slate-900/10 flex-1 flex items-center justify-center relative">
                  {previewLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 border-4 border-slate-300 border-t-transparent rounded-full animate-spin" aria-label="Loading preview" />
                    </div>
                  )}
                  {previewError && (
                    <div className="p-6 text-center text-sm text-slate-600">
                      {previewError}
                    </div>
                  )}
                  {previewFile?.accessUrl && !previewError && (
                    <img
                      src={previewFile.accessUrl}
                      alt={previewFile?.original_filename || previewFile?.name || 'File preview'}
                      className={`h-full w-full object-contain transition-opacity duration-300 ${previewLoading ? 'opacity-0' : 'opacity-100'}`}
                      onLoad={() => setPreviewLoading(false)}
                      onError={() => {
                        setPreviewLoading(false)
                        setPreviewError('Unable to load image preview.')
                      }}
                      loading="lazy"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ),
        document.body
      )
    : null
  
  const renderBreadcrumb = () => {
    if (currentView === 'buckets') return null
    
    const pathParts = currentPath ? currentPath.split('/') : []
    
    return (
      <div className="flex items-center space-x-2 text-sm text-slate-600 mb-4">
        <button 
          onClick={() => setCurrentView('buckets')}
          className="hover:text-blue-600 font-medium"
        >
          Buckets
        </button>
        <ChevronRight className="w-4 h-4" />
        <button 
          onClick={() => { setCurrentPath(''); }}
          className="hover:text-blue-600 font-medium"
        >
          {selectedBucket?.name}
        </button>
        {pathParts.map((part, index) => (
          <React.Fragment key={index}>
            <ChevronRight className="w-4 h-4" />
            <button 
              onClick={() => setCurrentPath(pathParts.slice(0, index + 1).join('/'))}
              className="hover:text-blue-600"
            >
              {part}
            </button>
          </React.Fragment>
        ))}
      </div>
    )
  }
  
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {currentView === 'buckets' ? 'Storage Buckets' : `${selectedBucket?.name} Files`}
          </h2>
          <p className="text-slate-600">
            {currentView === 'buckets' 
              ? 'Organize your files into buckets and folders' 
              : 'Browse files and folders in this bucket'
            }
          </p>
        </div>
        {renderBreadcrumb()}
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }
  
  if (currentView === 'buckets') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Storage Buckets</h2>
            <p className="text-slate-600">Organize your files into buckets and folders</p>
          </div>
          <button 
            onClick={() => setShowCreateForm(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Bucket
          </button>
        </div>
        
        {showCreateForm && (
          <div className="bg-slate-50 rounded-lg p-6">
            <form onSubmit={createBucket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Bucket Name
                </label>
                <input
                  type="text"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  placeholder="e.g., dailey-photos, documents, projects"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newBucketDescription}
                  onChange={(e) => setNewBucketDescription(e.target.value)}
                  placeholder="Photo storage with sm, lg variants"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={newBucketIsPublic}
                  onChange={(e) => setNewBucketIsPublic(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isPublic" className="text-sm text-slate-700">
                  Make this bucket public (files can be accessed without authentication)
                </label>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Bucket'}
                </button>
              </div>
            </form>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-red-600">Error: {error}</p>
            <button 
              onClick={fetchBuckets}
              className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buckets.map((bucket) => (
            <div key={bucket.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => openBucket(bucket)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <FolderOpen className="w-5 h-5 text-blue-600" />
                  <h3 className="font-medium text-slate-900">{bucket.name}</h3>
                </div>
                {bucket.is_public && (
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                    Public
                  </span>
                )}
              </div>
              
              {bucket.description && (
                <p className="text-sm text-slate-600 mb-3">{bucket.description}</p>
              )}
              
              <div className="text-sm text-slate-500">
                <div>Files: {bucket.file_count || 0}</div>
                <div>Created: {new Date(bucket.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
        
        {buckets.length === 0 && !loading && !error && (
          <div className="text-center py-12 bg-slate-50 rounded-lg">
            <Folder className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <p className="text-slate-600 mb-2">No buckets created yet</p>
            <p className="text-sm text-slate-500">Create your first bucket to organize your files</p>
          </div>
        )}
      </div>
    )
  }
  
  // Files view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {selectedBucket?.name} {currentPath && `/ ${currentPath}`}
          </h2>
          <p className="text-slate-600">Browse files and folders in this bucket</p>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowCreateFolder(true)}
            className="flex items-center px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Folder
          </button>
          <button 
            onClick={navigateUp}
            className="flex items-center px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </button>
        </div>
      </div>
      
      {renderBreadcrumb()}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Type</div>
          {typeOptions.map((option) => {
            const isActive = option.value === typeFilter
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTypeFilter(option.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sort</div>
          <div className="flex flex-wrap items-center gap-2">
            {sortOptions.map((option) => {
              const isActive = option.value === sortField
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (isActive) {
                      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                    } else {
                      setSortField(option.value)
                      setSortDirection('asc')
                    }
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="inline-flex items-center space-x-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800"
          >
            <ArrowUpDown className="h-4 w-4" />
            <span>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</span>
          </button>
        </div>
      </div>
      
      {showCreateFolder && (
        <div className="bg-slate-50 rounded-lg p-4">
          <form onSubmit={createFolder} className="flex items-center space-x-3">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g., sm, lg, thumbnails"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateFolder(false)}
              className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </form>
        </div>
      )}
      
      {detailsPortal}

      {previewPortal}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={cancelDeleteFile} />
          <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full mx-4 p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Delete File
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Are you sure you want to delete "{fileToDelete.original_filename || fileToDelete.name}"? This action cannot be undone.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={cancelDeleteFile}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteFile}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 rounded-lg p-4">
          <p className="text-red-600">Error: {error}</p>
          <button 
            onClick={() => fetchBucketFiles(selectedBucket.id, currentPath)}
            className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}
      
      {!error && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Size
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Updated
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Access
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {displayFiles.length > 0 ? (
                displayFiles.map((file) => {
                  const isFolder = Boolean(file.is_folder)
                  const name = isFolder ? file.name : file.original_filename || file.name || file.id
                  const sizeLabel = isFolder ? '—' : formatFileSize(file.file_size)
                  const category = getFileCategory(file)
                  const typeLabel = isFolder ? 'Folder' : (CATEGORY_LABELS[category] || (file.mime_type || file.metadata?.mimeType || 'Unknown'))
                  const updatedLabel = formatDateTime(file.uploaded_at || file.updated_at || file.created_at)
                  const accessLabel = isFolder ? '—' : (file.access === 'public' ? 'Public link' : (file.access === 'private' || file.signed_url || file.signedUrl ? 'Private link' : 'Restricted'))
                  
                  return (
                    <tr key={file.id || file.name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            {getFileTypeIcon(file.mime_type || file.metadata?.mimeType || '', isFolder)}
                          </div>
                          {isFolder ? (
                            <button
                              type="button"
                              onClick={() => navigateToFolder(file.name)}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {name}
                            </button>
                          ) : (
                            <div className="truncate">{name}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{sizeLabel}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{typeLabel}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{updatedLabel}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{accessLabel}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex justify-end items-center space-x-2">
                          {isFolder ? (
                            <button
                              type="button"
                              onClick={() => navigateToFolder(file.name)}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <FolderOpen className="w-4 h-4 mr-1" />
                              Open
                            </button>
                          ) : (
                            <>
                              {getFileAccessUrl(file) && (
                                isImageFile(file) ? (
                                  <button
                                    type="button"
                                    onClick={() => openPreview(file)}
                                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    View
                                  </button>
                                ) : (
                                  <a
                                    href={getFileAccessUrl(file)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    View
                                  </a>
                                )
                              )}
                              <button
                                type="button"
                                onClick={() => openFileDetails(file)}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <Info className="w-4 h-4 mr-1" />
                                Details
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(file)}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    <div className="flex flex-col items-center space-y-2">
                      <Folder className="w-12 h-12 text-slate-300" />
                      {files.length === 0 ? (
                        <>
                          <p>This folder is empty</p>
                          <p className="text-xs text-slate-400">Upload files or create folders to organize your content</p>
                        </>
                      ) : (
                        <>
                          <p>No files match the current filter</p>
                          <p className="text-xs text-slate-400">Try choosing a different type or reset the filters</p>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Auth-aware app wrapper
function AppWithAuth() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">D</span>
          </div>
          <div className="text-2xl mb-2">Loading...</div>
          <p className="text-slate-600">Checking authentication status</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <AuthenticatedApp /> : <LoginForm />;
}

// Main App component with auth provider
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppWithAuth />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App
