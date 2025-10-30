import { useState, useEffect } from 'react'
import { 
  FileImage, 
  Search, 
  Filter, 
  Grid3X3, 
  List, 
  Download,
  Trash2,
  Edit,
  Eye,
  MoreHorizontal,
  Upload,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileType,
  Ruler,
  Tag,
  RefreshCw,
  Image,
  Video,
  Music,
  FileText
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '../lib/utils'

const API_KEY = 'dmapi_dev_zR0XufVsrw2EIawIwnTV9HravIRQcKtI'; // Default API key
const DEFAULT_APP_ID = 'castingly'; // Target application scope for Castingly assets

export default function MediaTab({ appId = DEFAULT_APP_ID }) {
  const [mediaFiles, setMediaFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'list'
  const [selectedFiles, setSelectedFiles] = useState(new Set())
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 24,
    offset: 0,
    has_more: false
  })
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({
    mime_type: '',
    processing_status: '',
    order_by: 'uploaded_at',
    order_direction: 'DESC'
  })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchMediaFiles()
  }, [pagination.offset, searchQuery, filters, appId])

  const fetchMediaFiles = async () => {
    try {
      setLoading(true)
      setError(null)

      const queryParams = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        order_by: filters.order_by,
        order_direction: filters.order_direction
      })

      if (appId) {
        queryParams.append('app_id', appId)
      }

      if (searchQuery) queryParams.append('search', searchQuery)
      if (filters.mime_type) queryParams.append('mime_type', filters.mime_type)
      if (filters.processing_status) queryParams.append('processing_status', filters.processing_status)

      const response = await fetch(`/api/files?${queryParams}`, {
        headers: {
          'X-API-Key': API_KEY
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setMediaFiles(data.files || [])
        setPagination(prev => ({
          ...prev,
          total: data.pagination.total,
          has_more: data.pagination.has_more
        }))
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.error || 'Failed to fetch files')
      }
    } catch (error) {
      setError('Error fetching files: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setPagination(prev => ({ ...prev, offset: 0 }))
    fetchMediaFiles()
  }

  const handlePageChange = (newOffset) => {
    setPagination(prev => ({ ...prev, offset: newOffset }))
  }

  const handleFileSelect = (fileId) => {
    setSelectedFiles(prev => {
      const newSelected = new Set(prev)
      if (newSelected.has(fileId)) {
        newSelected.delete(fileId)
      } else {
        newSelected.add(fileId)
      }
      return newSelected
    })
  }

  const handleSelectAll = () => {
    if (selectedFiles.size === mediaFiles.length) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(mediaFiles.map(file => file.id)))
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getFileTypeIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return <Image className="w-4 h-4" />
    if (mimeType.startsWith('video/')) return <Video className="w-4 h-4" />
    if (mimeType.startsWith('audio/')) return <Music className="w-4 h-4" />
    return <FileText className="w-4 h-4" />
  }

  if (loading && mediaFiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
          <span className="text-slate-600">Loading media files...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <FileImage className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 font-medium mb-2">{error}</p>
          <button 
            onClick={fetchMediaFiles}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Media Library</h2>
          <p className="text-slate-600 mt-1">
            {pagination.total > 0 ? (
              <>Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} files</>
            ) : (
              'No media files found'
            )}
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {selectedFiles.size > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-600">{selectedFiles.size} selected</span>
              <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showFilters ? "bg-blue-100 text-blue-700" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            )}
          >
            <Filter className="h-4 w-4" />
          </button>
          
          <div className="flex border border-slate-200 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 transition-colors",
                viewMode === 'grid' ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 transition-colors",
                viewMode === 'list' ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <form onSubmit={handleSearch} className="flex space-x-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by filename, title, description, or keywords..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
        </form>

        {showFilters && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">File Type</label>
                <select
                  value={filters.mime_type}
                  onChange={(e) => setFilters(prev => ({ ...prev, mime_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Types</option>
                  <option value="image">Images</option>
                  <option value="video">Videos</option>
                  <option value="audio">Audio</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={filters.processing_status}
                  onChange={(e) => setFilters(prev => ({ ...prev, processing_status: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
                <select
                  value={filters.order_by}
                  onChange={(e) => setFilters(prev => ({ ...prev, order_by: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="uploaded_at">Upload Date</option>
                  <option value="original_filename">Filename</option>
                  <option value="file_size">File Size</option>
                  <option value="taken_at">Date Taken</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Order</label>
                <select
                  value={filters.order_direction}
                  onChange={(e) => setFilters(prev => ({ ...prev, order_direction: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="DESC">Newest First</option>
                  <option value="ASC">Oldest First</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Media Grid/List */}
      {mediaFiles.length === 0 ? (
        <div className="text-center py-12">
          <FileImage className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No media files found</h3>
          <p className="text-slate-600 mb-4">
            {searchQuery || Object.values(filters).some(f => f && f !== 'uploaded_at' && f !== 'DESC') 
              ? 'Try adjusting your search or filters' 
              : 'Upload some files to get started'
            }
          </p>
          {searchQuery || Object.values(filters).some(f => f && f !== 'uploaded_at' && f !== 'DESC') ? (
            <button
              onClick={() => {
                setSearchQuery('')
                setFilters({
                  mime_type: '',
                  processing_status: '',
                  order_by: 'uploaded_at',
                  order_direction: 'DESC'
                })
              }}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Clear Filters
            </button>
          ) : (
            <div className="text-center">
              <p className="text-slate-500 mb-4">Database integration will enable full media management including:</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-slate-400 max-w-2xl mx-auto">
                <div className="flex flex-col items-center space-y-2">
                  <FileImage className="h-8 w-8" />
                  <span>File Metadata</span>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <Grid3X3 className="h-8 w-8" />
                  <span>Thumbnails</span>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <Search className="h-8 w-8" />
                  <span>Full-text Search</span>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <Tag className="h-8 w-8" />
                  <span>Tags & Collections</span>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <Trash2 className="h-8 w-8" />
                  <span>Batch Operations</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {mediaFiles.map((file) => (
            <div
              key={file.id}
              className={cn(
                "relative group bg-white rounded-lg border-2 transition-all duration-200 hover:shadow-md",
                selectedFiles.has(file.id) ? "border-blue-500 shadow-md" : "border-slate-200"
              )}
            >
              <div className="aspect-square relative overflow-hidden rounded-t-lg">
                {file.thumbnail_url ? (
                  <img
                    src={file.thumbnail_url}
                    alt={file.original_filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                    <span className="text-4xl">{getFileTypeIcon(file.mime_type)}</span>
                  </div>
                )}
                
                {/* Selection overlay */}
                <div
                  className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => handleFileSelect(file.id)}
                />
                
                {/* Selection checkbox */}
                <div className="absolute top-2 left-2">
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.id)}
                    onChange={() => handleFileSelect(file.id)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {/* Actions menu */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button className="p-1 bg-black/20 backdrop-blur-sm rounded text-white hover:bg-black/30">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className="bg-white rounded-lg shadow-lg border p-1 min-w-[160px]">
                        <DropdownMenu.Item className="flex items-center space-x-2 px-3 py-2 text-sm rounded hover:bg-slate-100 cursor-pointer">
                          <Eye className="h-4 w-4" />
                          <span>View Details</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="flex items-center space-x-2 px-3 py-2 text-sm rounded hover:bg-slate-100 cursor-pointer">
                          <Download className="h-4 w-4" />
                          <span>Download</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="flex items-center space-x-2 px-3 py-2 text-sm rounded hover:bg-slate-100 cursor-pointer">
                          <Edit className="h-4 w-4" />
                          <span>Edit Info</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="h-px bg-slate-200 my-1" />
                        <DropdownMenu.Item className="flex items-center space-x-2 px-3 py-2 text-sm rounded hover:bg-red-50 text-red-600 cursor-pointer">
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </div>

              <div className="p-3">
                <p className="text-sm font-medium text-slate-900 truncate" title={file.original_filename}>
                  {file.original_filename}
                </p>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatFileSize(file.file_size)}</span>
                  {file.width && file.height && (
                    <span>{file.width}×{file.height}</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {formatDate(file.uploaded_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // List view
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={selectedFiles.size === mediaFiles.length && mediaFiles.length > 0}
                onChange={handleSelectAll}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">
                {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : 'Select all'}
              </span>
            </div>
          </div>
          
          <div className="divide-y divide-slate-200">
            {mediaFiles.map((file) => (
              <div
                key={file.id}
                className={cn(
                  "flex items-center space-x-4 p-4 hover:bg-slate-50 transition-colors",
                  selectedFiles.has(file.id) && "bg-blue-50"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.id)}
                  onChange={() => handleFileSelect(file.id)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden">
                  {file.thumbnail_url ? (
                    <img
                      src={file.thumbnail_url}
                      alt={file.original_filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-lg">{getFileTypeIcon(file.mime_type)}</span>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {file.original_filename}
                  </p>
                  <div className="flex items-center space-x-4 mt-1 text-xs text-slate-500">
                    <span>{formatFileSize(file.file_size)}</span>
                    {file.width && file.height && (
                      <span className="flex items-center space-x-1">
                        <Ruler className="h-3 w-3" />
                        <span>{file.width}×{file.height}</span>
                      </span>
                    )}
                    <span className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(file.uploaded_at)}</span>
                    </span>
                  </div>
                </div>
                
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="bg-white rounded-lg shadow-lg border p-1 min-w-[160px]">
                      <DropdownMenu.Item className="flex items-center space-x-2 px-3 py-2 text-sm rounded hover:bg-slate-100 cursor-pointer">
                        <Eye className="h-4 w-4" />
                        <span>View Details</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="flex items-center space-x-2 px-3 py-2 text-sm rounded hover:bg-slate-100 cursor-pointer">
                        <Download className="h-4 w-4" />
                        <span>Download</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="flex items-center space-x-2 px-3 py-2 text-sm rounded hover:bg-slate-100 cursor-pointer">
                        <Edit className="h-4 w-4" />
                        <span>Edit Info</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="h-px bg-slate-200 my-1" />
                      <DropdownMenu.Item className="flex items-center space-x-2 px-3 py-2 text-sm rounded hover:bg-red-50 text-red-600 cursor-pointer">
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePageChange(Math.max(0, pagination.offset - pagination.limit))}
              disabled={pagination.offset === 0}
              className="flex items-center space-x-1 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>
            
            <button
              onClick={() => handlePageChange(pagination.offset + pagination.limit)}
              disabled={!pagination.has_more}
              className="flex items-center space-x-1 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
