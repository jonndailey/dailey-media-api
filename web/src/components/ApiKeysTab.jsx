import { useState, useEffect } from 'react'
import { 
  Key, 
  Plus, 
  Copy, 
  Trash2, 
  Edit, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle,
  Clock,
  Shield,
  AlertTriangle
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../lib/utils'

export default function ApiKeysTab() {
  const [apiKeys, setApiKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newKeyResult, setNewKeyResult] = useState(null)

  useEffect(() => {
    fetchApiKeys()
  }, [])

  const fetchApiKeys = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/keys', {
        headers: {
          'X-API-Key': 'dmapi_dev_zR0XufVsrw2EIawIwnTV9HravIRQcKtI' // Use default key for demo
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setApiKeys(data.keys || [])
      } else {
        setError('Failed to fetch API keys')
      }
    } catch (error) {
      setError('Error fetching API keys: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const createApiKey = async (keyData) => {
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'dmapi_dev_zR0XufVsrw2EIawIwnTV9HravIRQcKtI'
        },
        body: JSON.stringify(keyData)
      })
      
      if (response.ok) {
        const result = await response.json()
        setNewKeyResult(result.key)
        fetchApiKeys() // Refresh the list
        return result
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create API key')
      }
    } catch (error) {
      throw error
    }
  }

  const deleteApiKey = async (keyId) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/keys/${keyId}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': 'dmapi_dev_zR0XufVsrw2EIawIwnTV9HravIRQcKtI'
        }
      })
      
      if (response.ok) {
        fetchApiKeys() // Refresh the list
      } else {
        const error = await response.json()
        alert('Failed to delete API key: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      alert('Error deleting API key: ' + error.message)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusIcon = (key) => {
    if (!key.isActive) {
      return <XCircle className="h-4 w-4 text-red-500" />
    }
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return <Clock className="h-4 w-4 text-orange-500" />
    }
    return <CheckCircle className="h-4 w-4 text-green-500" />
  }

  const getPermissionBadgeColor = (permission) => {
    switch (permission) {
      case 'admin': return 'bg-red-100 text-red-700'
      case 'write': return 'bg-yellow-100 text-yellow-700'
      case 'read': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          <span className="text-slate-600">Loading API keys...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 font-medium">{error}</p>
          <button 
            onClick={fetchApiKeys}
            className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
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
          <h2 className="text-2xl font-bold text-slate-900">API Keys</h2>
          <p className="text-slate-600 mt-1">Manage API keys for accessing the Dailey Media API</p>
        </div>
        
        <Dialog.Root open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <Dialog.Trigger asChild>
            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="h-4 w-4" />
              <span>Create API Key</span>
            </button>
          </Dialog.Trigger>
          
          <CreateApiKeyDialog 
            onSubmit={createApiKey}
            onClose={() => setIsCreateDialogOpen(false)}
            newKeyResult={newKeyResult}
            onClearResult={() => setNewKeyResult(null)}
          />
        </Dialog.Root>
      </div>

      {/* API Keys List */}
      {apiKeys.length === 0 ? (
        <div className="text-center py-12">
          <Key className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No API keys found</h3>
          <p className="text-slate-600 mb-4">Create your first API key to get started with the Dailey Media API</p>
          <button 
            onClick={() => setIsCreateDialogOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create API Key
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {apiKeys.map((key) => (
            <div key={key.id} className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(key)}
                      <h3 className="text-lg font-semibold text-slate-900">{key.name}</h3>
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      {key.permissions.map((permission) => (
                        <span
                          key={permission}
                          className={cn(
                            "px-2 py-1 text-xs font-medium rounded-full",
                            getPermissionBadgeColor(permission)
                          )}
                        >
                          {permission}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="text-sm text-slate-600 space-y-1">
                    <p><span className="font-medium">ID:</span> {key.id}</p>
                    <p><span className="font-medium">Created:</span> {formatDate(key.createdAt)}</p>
                    {key.lastUsedAt && (
                      <p><span className="font-medium">Last used:</span> {formatDate(key.lastUsedAt)}</p>
                    )}
                    {key.expiresAt && (
                      <p><span className="font-medium">Expires:</span> {formatDate(key.expiresAt)}</p>
                    )}
                    <p><span className="font-medium">Scopes:</span> {key.scopes.join(', ')}</p>
                    <p><span className="font-medium">Rate limit:</span> {key.rateLimit.maxRequests} requests per {key.rateLimit.windowMs / 1000}s</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => deleteApiKey(key.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete API key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateApiKeyDialog({ onSubmit, onClose, newKeyResult, onClearResult }) {
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState(['read'])
  const [scopes, setScopes] = useState(['media'])
  const [expiresAt, setExpiresAt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const keyData = {
        name,
        permissions,
        scopes,
        expiresAt: expiresAt || null,
        metadata: {
          description: `Created via web interface on ${new Date().toISOString()}`
        }
      }

      await onSubmit(keyData)
      setName('')
      setPermissions(['read'])
      setScopes(['media'])
      setExpiresAt('')
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    onClearResult()
    onClose()
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <Dialog.Title className="text-xl font-bold text-slate-900 mb-4">
          {newKeyResult ? 'API Key Created' : 'Create New API Key'}
        </Dialog.Title>

        {newKeyResult ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800">API Key Created Successfully</span>
              </div>
              <p className="text-sm text-green-700">
                Your new API key has been created. Make sure to copy it now as it won't be shown again.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">API Key</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newKeyResult.key}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(newKeyResult.key)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Copy to clipboard"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-slate-700">Name:</span>
                <p className="text-slate-600">{newKeyResult.name}</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">Permissions:</span>
                <p className="text-slate-600">{newKeyResult.permissions.join(', ')}</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-800">{error}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="My API Key"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
              <div className="space-y-2">
                {['read', 'write', 'admin'].map((permission) => (
                  <label key={permission} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPermissions([...permissions, permission])
                        } else {
                          setPermissions(permissions.filter(p => p !== permission))
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-slate-700 capitalize">{permission}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Scopes</label>
              <div className="space-y-2">
                {['upload', 'media', 'transform'].map((scope) => (
                  <label key={scope} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setScopes([...scopes, scope])
                        } else {
                          setScopes(scopes.filter(s => s !== scope))
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-slate-700 capitalize">{scope}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Expiration Date (Optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name || permissions.length === 0 || scopes.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Creating...' : 'Create API Key'}
              </button>
            </div>
          </form>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  )
}