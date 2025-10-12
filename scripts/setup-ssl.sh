#!/bin/bash

# SSL Setup Script for Dailey Media API
# Automatically obtains and configures SSL certificates using Let's Encrypt

set -e

# Configuration
DOMAIN=${1:-api.dailey.dev}
EMAIL=${2:-admin@dailey.dev}
NGINX_CONFIG_DIR="/etc/nginx/sites-available"
SSL_DIR="/etc/ssl/certs"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Install Certbot
install_certbot() {
    log_info "Installing Certbot..."
    
    # Update package list
    apt-get update
    
    # Install snapd if not already installed
    if ! command -v snap &> /dev/null; then
        apt-get install -y snapd
    fi
    
    # Install certbot via snap
    snap install core; snap refresh core
    snap install --classic certbot
    
    # Create symlink
    ln -sf /snap/bin/certbot /usr/bin/certbot
    
    log_success "Certbot installed successfully"
}

# Stop services for certificate generation
stop_services() {
    log_info "Stopping web services..."
    
    # Stop nginx if running
    if systemctl is-active --quiet nginx; then
        systemctl stop nginx
        log_info "Nginx stopped"
    fi
    
    # Stop any process using port 80
    if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null; then
        log_warning "Port 80 is in use. Attempting to free it..."
        fuser -k 80/tcp || true
    fi
}

# Generate SSL certificate
generate_certificate() {
    log_info "Generating SSL certificate for $DOMAIN..."
    
    # Use standalone mode to obtain certificate
    certbot certonly --standalone \
        --preferred-challenges http \
        --agree-tos \
        --no-eff-email \
        --email "$EMAIL" \
        -d "$DOMAIN" \
        --non-interactive
    
    if [ $? -eq 0 ]; then
        log_success "SSL certificate generated successfully"
    else
        log_error "Failed to generate SSL certificate"
        exit 1
    fi
}

# Setup certificate paths
setup_certificate_paths() {
    log_info "Setting up certificate paths..."
    
    # Create SSL directory
    mkdir -p "$SSL_DIR"
    
    # Create symlinks to Let's Encrypt certificates
    ln -sf "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/fullchain.pem"
    ln -sf "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/privkey.pem"
    
    # Set proper permissions
    chmod 644 "$SSL_DIR/fullchain.pem"
    chmod 600 "$SSL_DIR/privkey.pem"
    
    log_success "Certificate paths configured"
}

# Configure Nginx
configure_nginx() {
    log_info "Configuring Nginx..."
    
    # Copy nginx configuration
    if [ -f "$PROJECT_DIR/nginx/nginx.conf" ]; then
        cp "$PROJECT_DIR/nginx/nginx.conf" /etc/nginx/nginx.conf
    fi
    
    # Copy site configuration
    if [ -f "$PROJECT_DIR/nginx/sites/default.conf" ]; then
        cp "$PROJECT_DIR/nginx/sites/default.conf" "$NGINX_CONFIG_DIR/dailey-media-api"
        
        # Update domain in configuration
        sed -i "s/api\.dailey\.dev/$DOMAIN/g" "$NGINX_CONFIG_DIR/dailey-media-api"
        
        # Enable site
        ln -sf "$NGINX_CONFIG_DIR/dailey-media-api" /etc/nginx/sites-enabled/
        
        # Remove default site if it exists
        rm -f /etc/nginx/sites-enabled/default
    fi
    
    # Test nginx configuration
    if nginx -t; then
        log_success "Nginx configuration is valid"
    else
        log_error "Nginx configuration is invalid"
        exit 1
    fi
}

# Setup automatic renewal
setup_renewal() {
    log_info "Setting up automatic certificate renewal..."
    
    # Create renewal script
    cat > /etc/cron.daily/renew-ssl << 'EOF'
#!/bin/bash

# Renew SSL certificates
/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"

# Log renewal attempts
echo "$(date): Certificate renewal check completed" >> /var/log/ssl-renewal.log
EOF
    
    chmod +x /etc/cron.daily/renew-ssl
    
    # Test renewal
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        log_success "Automatic renewal configured successfully"
    else
        log_warning "Renewal test failed, but certificate is still valid"
    fi
}

# Setup DH parameters for enhanced security
setup_dh_params() {
    log_info "Generating DH parameters (this may take a while)..."
    
    if [ ! -f /etc/ssl/certs/dhparam.pem ]; then
        openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048
        log_success "DH parameters generated"
    else
        log_info "DH parameters already exist"
    fi
}

# Start services
start_services() {
    log_info "Starting services..."
    
    # Start and enable nginx
    systemctl start nginx
    systemctl enable nginx
    
    log_success "Services started"
}

# Verify SSL configuration
verify_ssl() {
    log_info "Verifying SSL configuration..."
    
    # Wait a moment for services to start
    sleep 5
    
    # Test HTTPS connection
    if curl -f "https://$DOMAIN/health" >/dev/null 2>&1; then
        log_success "SSL configuration verified successfully"
    else
        log_warning "SSL verification failed, but certificate is installed"
    fi
    
    # Show certificate information
    echo "Certificate information:"
    certbot certificates | grep -A 5 "$DOMAIN" || true
}

# Firewall configuration
configure_firewall() {
    log_info "Configuring firewall..."
    
    # Install ufw if not present
    if ! command -v ufw &> /dev/null; then
        apt-get install -y ufw
    fi
    
    # Configure firewall rules
    ufw --force enable
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force reload
    
    log_success "Firewall configured"
}

# Main function
main() {
    log_info "Starting SSL setup for domain: $DOMAIN"
    
    # Check if domain and email are provided
    if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
        log_error "Usage: $0 <domain> <email>"
        log_error "Example: $0 api.dailey.dev admin@dailey.dev"
        exit 1
    fi
    
    # Run setup steps
    check_root
    install_certbot
    stop_services
    generate_certificate
    setup_certificate_paths
    setup_dh_params
    configure_nginx
    setup_renewal
    configure_firewall
    start_services
    verify_ssl
    
    log_success "🔒 SSL setup completed successfully!"
    log_info "Your API is now available at: https://$DOMAIN"
    log_info "Certificate will auto-renew every 12 hours"
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"