"""
config.py - Nunba application configuration

This file contains configuration that is embedded at build time.
Do not commit sensitive production keys to version control.
"""
import os

# =============================================================================
# Sentry Crash Reporting Configuration
# =============================================================================
# Get your DSN from: https://sentry.io/settings/projects/YOUR_PROJECT/keys/
# Free tier: 5,000 errors/month

# Production DSN (replace with your actual DSN from Sentry)
SENTRY_DSN = os.environ.get(
    'SENTRY_DSN',
    'https://b5e7f8c9d1234567890abcdef1234567@o4508123456789.ingest.us.sentry.io/4508123456789'
)

# Environment detection
def get_environment():
    """Detect current environment"""
    if os.environ.get('NUNBA_ENV'):
        return os.environ.get('NUNBA_ENV')
    if os.environ.get('FLASK_ENV') == 'development':
        return 'development'
    # Check if running from source vs frozen executable
    import sys
    if getattr(sys, 'frozen', False):
        return 'production'
    return 'development'

ENVIRONMENT = get_environment()

# =============================================================================
# App Configuration
# =============================================================================
APP_NAME = "Nunba"
APP_VERSION = "2.0.0"
APP_IDENTIFIER = "com.hevolve.nunba"

# =============================================================================
# Feature Flags
# =============================================================================
CRASH_REPORTING_ENABLED = os.environ.get('NUNBA_CRASH_REPORTING', 'false').lower() == 'true'
PERFORMANCE_MONITORING_ENABLED = os.environ.get('NUNBA_PERFORMANCE', 'true').lower() == 'true'
ANALYTICS_ENABLED = os.environ.get('NUNBA_ANALYTICS', 'true').lower() == 'true'

# =============================================================================
# API Endpoints
# =============================================================================
API_BASE_URL = os.environ.get('NUNBA_API_URL', 'https://hevolve.ai/api')
LOCAL_BACKEND_PORT = int(os.environ.get('NUNBA_LOCAL_PORT', 5000))

# =============================================================================
# Paths
# =============================================================================
import sys
from pathlib import Path


def get_app_dir():
    """Get application directory"""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).parent

def get_data_dir():
    """Get user data directory"""
    if sys.platform == 'win32':
        base = os.environ.get('APPDATA', os.path.expanduser('~'))
        return Path(base) / 'Nunba'
    elif sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Application Support' / 'Nunba'
    else:
        return Path.home() / '.nunba'

def get_log_dir():
    """Get log directory"""
    if sys.platform == 'win32':
        return Path.home() / 'Documents' / 'Nunba' / 'logs'
    elif sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Logs' / 'Nunba'
    else:
        return Path.home() / '.nunba' / 'logs'

APP_DIR = get_app_dir()
DATA_DIR = get_data_dir()
LOG_DIR = get_log_dir()

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)
