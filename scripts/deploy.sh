#!/bin/bash

# Dailey Media API Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Environment-specific configurations
case $ENVIRONMENT in
    "development"|"dev")
        ENV_FILE=".env.development"
        PM2_ENV="development"
        BRANCH="develop"
        ;;
    "staging")
        ENV_FILE=".env.staging"
        PM2_ENV="staging"
        BRANCH="develop"
        ;;
    "production"|"prod")
        ENV_FILE=".env.production"
        PM2_ENV="production"
        BRANCH="main"
        ;;
    *)
        log_error "Unknown environment: $ENVIRONMENT"
        echo "Usage: $0 [development|staging|production]"
        exit 1
        ;;
esac

log_info "Starting deployment to $ENVIRONMENT environment..."

# Pre-deployment checks
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 is not installed. Installing globally..."
        npm install -g pm2
    fi
    
    # Check if environment file exists
    if [ ! -f "$ENV_FILE" ]; then
        log_warning "Environment file $ENV_FILE not found. Using .env.example as template."
        cp .env.example "$ENV_FILE"
        log_warning "Please update $ENV_FILE with your configuration before proceeding."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Backup current deployment
backup_current() {
    if [ "$ENVIRONMENT" = "production" ]; then
        log_info "Creating backup of current deployment..."
        
        BACKUP_DIR="/opt/backups/dailey-media-api/$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        # Backup application files
        if [ -d "$PROJECT_DIR" ]; then
            cp -r "$PROJECT_DIR" "$BACKUP_DIR/"
            log_success "Backup created at $BACKUP_DIR"
        fi
    fi
}

# Update code from git
update_code() {
    log_info "Updating code from git..."
    
    # Fetch latest changes
    git fetch origin
    
    # Stash any local changes
    git stash push -m "Deployment stash $(date)"
    
    # Checkout the target branch
    git checkout "$BRANCH"
    
    # Pull latest changes
    git pull origin "$BRANCH"
    
    log_success "Code updated successfully"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Clean install for production
    if [ "$ENVIRONMENT" = "production" ]; then
        npm ci --production
    else
        npm ci
    fi
    
    log_success "Dependencies installed"
}

# Run tests
run_tests() {
    if [ "$ENVIRONMENT" != "production" ]; then
        log_info "Running tests..."
        
        # Set test environment
        export NODE_ENV=test
        
        # Run linting
        if npm run lint; then
            log_success "Linting passed"
        else
            log_error "Linting failed"
            exit 1
        fi
        
        # Run tests
        if npm test; then
            log_success "Tests passed"
        else
            log_error "Tests failed"
            exit 1
        fi
    else
        log_info "Skipping tests in production deployment"
    fi
}

# Build application
build_application() {
    log_info "Building application..."
    
    # Run build script if it exists
    if npm run build 2>/dev/null; then
        log_success "Application built successfully"
    else
        log_info "No build script found, skipping build step"
    fi
}

# Setup environment
setup_environment() {
    log_info "Setting up environment..."
    
    # Copy environment file
    cp "$ENV_FILE" .env
    
    # Create necessary directories
    mkdir -p storage/files
    mkdir -p logs
    
    # Set permissions
    chmod 755 storage
    chmod 755 logs
    
    log_success "Environment setup complete"
}

# Database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Run migrations if script exists
    if [ -f "src/scripts/migrate.js" ]; then
        if node src/scripts/migrate.js; then
            log_success "Migrations completed successfully"
        else
            log_error "Migrations failed"
            exit 1
        fi
    else
        log_info "No migration script found, skipping migrations"
    fi
}

# Manage PM2 process
manage_pm2() {
    log_info "Managing PM2 process..."
    
    # Check if process is already running
    if pm2 list | grep -q "dailey-media-api"; then
        log_info "Reloading existing PM2 process..."
        pm2 reload ecosystem.config.cjs --env "$PM2_ENV"
    else
        log_info "Starting new PM2 process..."
        pm2 start ecosystem.config.cjs --env "$PM2_ENV"
    fi
    
    # Save PM2 configuration
    pm2 save
    
    log_success "PM2 process managed successfully"
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    # Wait for application to start
    sleep 10
    
    # Get port from environment or default
    PORT=$(grep "^PORT=" .env | cut -d'=' -f2 || echo "4000")
    HEALTH_URL="http://localhost:$PORT/health"
    
    # Check health endpoint
    for i in {1..5}; do
        if curl -f "$HEALTH_URL" >/dev/null 2>&1; then
            log_success "Health check passed"
            return 0
        else
            log_warning "Health check attempt $i failed, retrying..."
            sleep 5
        fi
    done
    
    log_error "Health check failed after 5 attempts"
    return 1
}

# Rollback function
rollback() {
    log_error "Deployment failed, initiating rollback..."
    
    if [ "$ENVIRONMENT" = "production" ] && [ -n "$BACKUP_DIR" ]; then
        log_info "Restoring from backup..."
        
        # Stop current process
        pm2 stop ecosystem.config.cjs || true
        
        # Restore from backup
        cp -r "$BACKUP_DIR/$(basename $PROJECT_DIR)"/* "$PROJECT_DIR/"
        
        # Start restored version
        pm2 start ecosystem.config.cjs --env "$PM2_ENV"
        
        log_success "Rollback completed"
    else
        log_warning "No backup available for rollback"
    fi
}

# Cleanup function
cleanup() {
    log_info "Performing cleanup..."
    
    # Remove old backups (keep last 5)
    if [ "$ENVIRONMENT" = "production" ]; then
        find /opt/backups/dailey-media-api -type d -name "20*" | sort -r | tail -n +6 | xargs rm -rf
    fi
    
    # Clean npm cache
    npm cache clean --force 2>/dev/null || true
    
    log_success "Cleanup completed"
}

# Post-deployment notifications
send_notifications() {
    log_info "Sending deployment notifications..."
    
    # Slack notification (if webhook URL is configured)
    if [ -n "${SLACK_WEBHOOK_URL}" ]; then
        SLACK_MESSAGE="🚀 Dailey Media API deployed successfully to $ENVIRONMENT environment"
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$SLACK_MESSAGE\"}" \
            "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true
    fi
    
    log_success "Notifications sent"
}

# Main deployment function
deploy() {
    # Set error handler
    trap rollback ERR
    
    # Run deployment steps
    check_prerequisites
    backup_current
    update_code
    install_dependencies
    run_tests
    build_application
    setup_environment
    run_migrations
    manage_pm2
    
    # Check if deployment was successful
    if health_check; then
        cleanup
        send_notifications
        log_success "🎉 Deployment to $ENVIRONMENT completed successfully!"
    else
        log_error "❌ Deployment failed health check"
        exit 1
    fi
}

# Run deployment
deploy