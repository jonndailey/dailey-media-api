import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg">
            <h1 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h1>
            <details className="text-sm text-gray-700">
              <summary className="cursor-pointer mb-2">Error details</summary>
              <div className="bg-gray-100 p-2 rounded overflow-auto">
                <div className="font-mono text-xs">
                  <div><strong>Error:</strong> {this.state.error && this.state.error.toString()}</div>
                  <div><strong>Stack:</strong> {this.state.errorInfo && this.state.errorInfo.componentStack}</div>
                </div>
              </div>
            </details>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;