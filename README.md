# ⛳ Golf Tee Time Automation System

An intelligent automated booking system for Trump National Colts Neck golf course that handles both manual scheduling and weekend auto-booking with smart retry logic, fallback slot selection, and real-time status tracking.

## 🌟 Key Features

### 🤖 Intelligent Booking Engine
- **Multi-Slot Priority**: Books 4-person slots first, then falls back to 3→2→1 person slots
- **Smart Date Handling**: Robust timezone-aware date processing prevents booking wrong dates
- **Retry Logic**: 10 attempts with 2-second delays for network resilience
- **Cache-Busting**: Ensures fresh tee sheet data with timestamp parameters
- **Success Validation**: Verifies bookings with dynamic date matching

### ⚡ Automated Systems
- **Precise Timing**: Books slots exactly when they open (7 days in advance at 6:30 AM EDT)
- **Weekend Auto-Booking**: Automatically reserves every Saturday and Sunday
- **Manual Bookings**: Schedule for any specific date with custom time preferences
- **Catch-up Mode**: Books already-open weekends when system is re-enabled
- **4-Weekend Limit**: Maintains maximum of 4 future weekend bookings

### 🛡️ Enterprise-Grade Reliability
- **Graceful Shutdown**: Proper SIGTERM/SIGINT handling and database connection cleanup
- **Database Resilience**: Auto-retry database connections instead of crashing
- **Error Recovery**: Handles uncaught exceptions and unhandled promise rejections
- **Session Management**: Automatic re-authentication when sessions expire
- **Async File Operations**: Non-blocking debug file saves with error handling

### 📊 Modern Dashboard
- **React-based UI**: Clean interface with Tailwind CSS
- **Real-time Updates**: Live status tracking every 30 seconds
- **Three-tab Layout**: Manual Bookings, Weekend Auto-Booking, Settings
- **Detailed Logging**: Complete booking attempt history with timestamps
- **Debug Tools**: Built-in tee sheet viewer and slot parsing diagnostics

## 🚀 Quick Start with Docker

### Prerequisites
- Docker and Docker Compose
- Git

### 1. Clone and Setup
```bash
git clone <repository-url>
cd tee
```

### 2. Environment Configuration
Create a `.env` file:
```env
# Database Configuration
DB_HOST=db
DB_USER=root
DB_PASSWORD=your_secure_password
DB_NAME=golf_booking

# Server Configuration
PORT=3001
NODE_ENV=production

# Time Zone (Critical for booking accuracy)
TZ=America/New_York

# Golf Site Configuration
GOLF_SITE_URL=https://www.trumpcoltsneck.com
COURSE_ID=95
```

### 3. Deploy
```bash
# Build and start all services
docker-compose up --build -d

# Verify deployment
docker-compose ps
docker-compose logs -f app
```

### 4. Access & Configure
1. Open http://localhost:3001
2. Navigate to **Settings** tab
3. Enter your golf club credentials
4. Enable **Weekend Auto-Booking** if desired

## 📦 Docker Services

### Service Architecture
- **MySQL 8.0**: Database with persistent storage and health checks
- **Node.js App**: Backend API and React frontend with graceful shutdown
- **Persistent Volume**: `dbdata` preserves all data between deployments

### Container Management
```bash
# Start services
docker-compose up -d

# View logs (real-time)
docker-compose logs -f app

# Graceful shutdown
docker-compose down

# Rebuild after updates
docker-compose up --build -d

# Check service health
docker-compose ps
```

## 💾 Database Management

### Automated Backup
```bash
# Create timestamped backup
docker-compose exec db mysqladump -u root -p${DB_PASSWORD} ${DB_NAME} > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore Database
```bash
# Restore from backup
docker-compose exec -T db mysql -u root -p${DB_PASSWORD} ${DB_NAME} < backup_file.sql
```

## 🔧 Manual Installation

### Prerequisites
- Node.js (v18 or higher)
- MySQL 8.0+

### Setup Steps
```bash
# Install dependencies
npm install

# Build frontend
npm run build

# Start production server
npm start
```

Set `DB_HOST=localhost` in `.env` for manual installation.

## 📱 Usage Guide

### Manual Booking Process
1. **Settings Tab**: Configure golf club credentials
2. **Manual Bookings Tab**: Select date, set time preferences, click "Add Booking"
3. **Automatic Execution**: System books when the 7-day window opens

### Weekend Auto-Booking
1. **Enable**: Toggle weekend automation in the dedicated tab
2. **Immediate Action**: Books all currently available weekends
3. **Ongoing**: Monitors every 30 minutes, books at 6:30 AM EDT on weekends

### Booking Status Guide
| Status | Meaning | System Action |
|--------|---------|---------------|
| ⏳ **Scheduled** | Waiting for booking window | Will auto-book when opens |
| 🔄 **Checking** | Searching for available slots | Trying fallback priorities |
| ✅ **Booked** | Successfully reserved | Complete - check golf site |
| ❌ **No Slots** | No times in preferred range | Will retry when window opens |
| 🟡 **Partial** | Booked non-4-person slot | Check if acceptable |

## 🔌 API Reference

### Core Endpoints
```http
# Settings & Authentication
GET    /api/settings                 # Get user settings
POST   /api/settings/credentials     # Update and verify credentials

# Booking Management
GET    /api/bookings                 # List all bookings
POST   /api/bookings                 # Create manual booking
DELETE /api/bookings/:id             # Remove booking
POST   /api/bookings/:id/trigger     # Manual trigger

# Weekend Automation
GET    /api/weekend-settings         # Get weekend config
POST   /api/weekend-settings         # Toggle weekend booking
GET    /api/upcoming-weekends        # Weekend schedule
GET    /api/weekend-history          # Booking history

# Monitoring & Debug
GET    /api/health                   # System health check
GET    /api/view/teesheet           # Live parsed tee sheet
GET    /api/debug/slots             # Slot parsing debug info
```

## 🗄️ Database Schema

### Core Tables
- **`user_settings`**: Encrypted credentials and session data
- **`booking_preferences`**: Manual booking requests with status tracking
- **`booking_logs`**: Detailed attempt history with full response data
- **`guest_list`**: Pre-configured guest roster to avoid member billing
- **`weekend_auto_settings`**: Weekend automation configuration
- **`weekend_booking_history`**: Complete weekend booking tracking

## 🔍 Troubleshooting

### Common Issues

**"Date mismatch" or wrong date booking**
- Fixed: System now handles timezone conversions properly
- All dates processed in local timezone (EDT/EST)

**"No slots available" repeatedly**
- Normal if preferred times (7:50 AM - 1:00 PM for weekends) are fully booked
- System tries 4→3→2→1 person slot fallback automatically
- Manual bookings allow wider time ranges

**Authentication failures**
- Verify credentials in Settings tab with "Update & Verify" button
- Check that golf club account is active and not locked
- Clear browser cache if web interface issues

**Weekend booking not working**
- Ensure weekend auto-booking is enabled
- Check not at 4-weekend limit (view in weekend tab)
- Verify booking window is open (weekends only bookable 7 days ahead)

### Debug Tools
```bash
# Monitor system in real-time
docker-compose logs -f app

# View current tee sheet parsing
curl http://localhost:3001/api/view/teesheet

# Check system health
curl http://localhost:3001/api/health

# Database direct access
docker-compose exec db mysql -u root -p${DB_PASSWORD} ${DB_NAME}
```

### Advanced Debugging
```bash
# Complete reset (⚠️ destroys all data)
docker-compose down -v
docker-compose up --build -d

# Container health diagnostics
docker-compose ps
docker inspect <container_id>
```

## 📊 System Architecture

### Booking Intelligence
1. **Dynamic Slot Priority**: Tries 4-person slots first, falls back intelligently
2. **Network Resilience**: 10 retry attempts with exponential backoff
3. **Cache Prevention**: Timestamp-based parameters ensure fresh data
4. **Date Validation**: Confirms server returns correct date before parsing
5. **Success Detection**: Dynamic day-of-week matching for booking confirmation

### Authentication & Security
- **RC4 Encryption**: Credential storage (required for golf site compatibility)
- **Session Persistence**: Cookie-based authentication with auto-renewal
- **Prepared Statements**: SQL injection prevention
- **Graceful Error Handling**: No sensitive data in logs

### Performance Features
- **Async Operations**: Non-blocking file I/O and database operations
- **Connection Pooling**: Efficient database resource management
- **Memory Management**: Proper timer cleanup and graceful shutdown
- **Resource Monitoring**: Health checks and automatic recovery

## 🔒 Security & Compliance

### Built-in Security
- **Encrypted Password Storage**: RC4 encryption for golf site credentials
- **Secure Session Management**: Token-based authentication with expiration
- **Input Validation**: All API inputs validated and sanitized
- **Error Sanitization**: Sensitive information excluded from client responses

### Production Safeguards
- **Graceful Shutdown**: SIGTERM/SIGINT handlers prevent data corruption
- **Database Resilience**: Connection retry logic prevents crashes
- **Exception Handling**: Uncaught exceptions and promise rejections handled
- **Resource Cleanup**: Proper connection and timer cleanup on shutdown

## 📈 Monitoring & Performance

### Key Metrics
- **Booking Success Rate**: Track via `booking_logs` table
- **System Health**: `/api/health` endpoint for uptime monitoring
- **Database Performance**: Connection status and query timing
- **Authentication Status**: Login attempt monitoring

### Resource Usage
- **Memory**: ~150MB typical usage
- **CPU**: Minimal idle, spikes during booking windows
- **Storage**: Database grows ~1MB monthly with typical usage
- **Network**: Golf site requests only during active booking periods

## 📄 Project Information

**Version**: 2.1.0  
**Status**: Production Ready  
**Updated**: August 2025  
**License**: Private Use Only  

### Technology Stack
- **Frontend**: React 18, Tailwind CSS, Vite
- **Backend**: Node.js, Express.js with graceful shutdown
- **Database**: MySQL 8.0 with connection pooling
- **Deployment**: Docker Compose with health checks
- **Automation**: node-cron, axios with cookie persistence

### Recent Improvements (v2.1.0)
- ✅ Fixed timezone conversion issues causing wrong date bookings
- ✅ Added intelligent slot fallback (4→3→2→1 person priority)
- ✅ Implemented retry logic with network resilience
- ✅ Enhanced booking success detection with dynamic date matching
- ✅ Added graceful shutdown and database connection retry
- ✅ Improved error handling and async file operations

---

⚠️ **Important**: This system interfaces with Trump National Colts Neck's booking system. Use responsibly and respect the golf club's terms of service. All operations are performed in EDT/EST timezone.