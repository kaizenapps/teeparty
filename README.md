# ⛳ Golf Tee Time Automation System

An intelligent automated booking system for Trump National Colts Neck golf course that handles both manual scheduling and weekend auto-booking with smart retry logic and real-time status tracking.

## 🌟 Features

### 🤖 Automated Booking
- **Precise Timing**: Books slots exactly when they open (7 days in advance at 6:30 AM EDT)
- **Weekend Auto-Booking**: Automatically reserves every Saturday and Sunday
- **Smart Retry Logic**: Won't retry if no slots available in preferred time range
- **4-Weekend Limit**: Maintains maximum of 4 future weekends booked

### 🛡️ Intelligent Authentication
- **RC4 Encryption**: Secure credential storage
- **Session Management**: Automatic re-authentication when needed
- **Two-Step Login**: Token exchange with session persistence

### 👥 Guest Management
- **Pre-configured Guest List**: Avoids member billing charges
- **Automatic Guest Assignment**: Smart guest selection for bookings

### 📊 Real-time Dashboard
- **React-based UI**: Modern interface with Tailwind CSS
- **Auto-refresh**: Live status updates every 30 seconds
- **Color-coded Status**: Visual indicators for booking states
- **Three-tab Layout**: Manual Bookings, Weekend Auto-Booking, Settings
- **Booking History**: Complete activity logs

### ⏰ Smart Scheduling
- **Manual Bookings**: Schedule for any date with custom time preferences
- **Weekend Automation**: Fixed 7:50 AM - 1:00 PM time range
- **Immediate Catch-up**: Books already-open weekends when enabled
- **30-Minute Checks**: Regular monitoring for booking opportunities

## 🚀 Quick Start with Docker (Recommended)

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

# Golf Site Configuration
GOLF_SITE_URL=https://www.trumpcoltsneck.com
COURSE_ID=95

# Time Zone (Critical for booking accuracy)
TZ=America/New_York

# Admin Credentials (Optional)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password
```

### 3. Deploy
```bash
# Build and start all services
docker-compose up --build -d

# Verify deployment
docker-compose ps
docker-compose logs -f app
```

### 4. Access Application
Open http://localhost:3001

### 5. Initial Configuration
1. Navigate to **Settings** tab
2. Enter your golf club credentials
3. Click "Update & Verify Credentials"
4. Go to **Weekend Auto-Booking** tab and enable if desired

## 📦 Docker Services

### Application Stack
- **MySQL 8.0**: Database with persistent storage
- **Node.js App**: Backend API and React frontend
- **Persistent Volume**: `dbdata` preserves all data between deployments

### Service Health Checks
- **Database**: `mysqladmin ping` every 10 seconds
- **Application**: HTTP health check every 30 seconds

### Container Management
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f
docker-compose logs app
docker-compose logs db

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up --build -d

# Check service health
docker-compose ps
```

## 💾 Database Backup & Restore

### Quick Backup
```bash
# Create timestamped backup
docker-compose exec db mysqladump -u root -p${DB_PASSWORD} ${DB_NAME} > backup_$(date +%Y%m%d_%H%M%S).sql

# Simple backup
docker-compose exec db mysqladump -u root -p golf_booking > golf_backup.sql
```

### Backup with Docker Run (Alternative)
```bash
# If containers are not running
docker run --rm --network tee_default mysql:8.0 mysqldump -h db -u root -p[password] golf_booking > backup.sql
```

### Restore Database
```bash
# Restore from backup file
docker-compose exec -T db mysql -u root -p${DB_PASSWORD} ${DB_NAME} < backup_file.sql

# Interactive restore
cat backup_file.sql | docker-compose exec -T db mysql -u root -p${DB_PASSWORD} ${DB_NAME}
```

### Automated Backup Script
Create `backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/golf_backup_${TIMESTAMP}.sql"

mkdir -p ${BACKUP_DIR}
docker-compose exec db mysqladump -u root -p${DB_PASSWORD} ${DB_NAME} > ${BACKUP_FILE}
echo "Backup created: ${BACKUP_FILE}"

# Keep only last 7 backups
ls -t ${BACKUP_DIR}/golf_backup_*.sql | tail -n +8 | xargs -d '\n' rm -f
```

## 🔧 Manual Installation (Alternative)

### Prerequisites
- Node.js (v18 or higher)
- MySQL 8.0+
- npm or yarn

### Installation Steps
```bash
# 1. Clone repository
git clone <repository-url>
cd tee

# 2. Install dependencies
npm install

# 3. Create database
mysql -u root -p
CREATE DATABASE golf_booking;
```

### Database Schema Setup
```sql
-- Run the complete schema from the Docker section
-- Or import from a backup file
mysql -u root -p golf_booking < schema.sql
```

### Environment Setup
Create `.env` file with `DB_HOST=localhost` instead of `db`.

### Build and Run
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## 📱 Usage Guide

### Manual Booking Workflow
1. **Settings Tab**: Configure golf club credentials
2. **Manual Bookings Tab**:
   - Select date (weekend filter available)
   - Set preferred time (e.g., 7:54 AM)
   - Set maximum acceptable time (e.g., 1:00 PM)
   - Click "Add Booking"
3. **Automatic Execution**: System books when window opens

### Weekend Auto-Booking
1. **Enable**: Click "Enable" in Weekend Auto-Booking tab
2. **Immediate Action**: System checks all currently open weekends
3. **Ongoing Monitoring**: 
   - Checks every 30 minutes for new opportunities
   - Books at 6:30 AM EDT on Sat/Sun for 7 days ahead
   - Maintains 4-weekend maximum

### Status Reference
| Status | Meaning | Action |
|--------|---------|--------|
| 🟢 **Booking window OPEN** | Can be booked now | System attempting |
| 🔄 **Checking for Slots** | Searching available times | In progress |
| ❌ **No Slots Available** | No times in range | Will retry when window opens |
| ⏳ **Scheduled** | Waiting for window | Will auto-book |
| ✅ **Booked** | Successfully reserved | Complete |
| ⏸️ **Manual Only** | Auto-booking disabled | User action needed |

## 🔌 API Reference

### Authentication & Settings
```http
GET    /api/settings                 # Get user settings
POST   /api/settings/credentials     # Update credentials
```

### Booking Management
```http
GET    /api/bookings                 # List all bookings
POST   /api/bookings                 # Create manual booking
DELETE /api/bookings/:id             # Remove booking
POST   /api/bookings/:id/trigger     # Manual trigger
```

### Weekend Automation
```http
GET    /api/weekend-settings         # Get weekend config
POST   /api/weekend-settings         # Toggle weekend booking
GET    /api/upcoming-weekends        # Weekend schedule
GET    /api/weekend-history          # Booking history
```

### Debug & Monitoring
```http
GET    /api/health                   # Health check
GET    /api/view/teesheet           # Parsed tee sheet
GET    /api/debug/slots             # Slot parsing debug
```

## 🗄️ Database Schema

### Core Tables
- **`user_settings`**: Encrypted credentials and session data
- **`booking_preferences`**: Scheduled booking requests
- **`booking_logs`**: Detailed attempt history
- **`guest_list`**: Pre-configured guest roster
- **`weekend_auto_settings`**: Weekend automation configuration
- **`weekend_booking_history`**: Weekend booking tracking

### Key Relationships
```
user_settings (1) ─── (n) booking_preferences
booking_preferences (1) ─── (n) booking_logs
user_settings (1) ─── (1) weekend_auto_settings
```

## 🔍 Troubleshooting

### Docker Issues
```bash
# Container unhealthy
docker-compose logs app
docker-compose logs db

# Database connection issues
docker-compose exec db mysql -u root -p${DB_PASSWORD} ${DB_NAME}

# Volume issues
docker volume ls
docker volume inspect tee_dbdata

# Complete reset (⚠️ destroys data)
docker-compose down -v
docker-compose up --build -d
```

### Application Issues

**"No slots available"**
- Normal if all preferred times (7:50 AM - 1:00 PM) are booked
- Manual booking allows afternoon slots

**"Authentication failed"**
- Verify credentials in Settings tab
- Ensure golf club account is active
- Check for website changes

**Weekend booking not working**
- Confirm weekend auto-booking is enabled
- Verify not at 4-weekend limit
- Check booking window is actually open (weekends only open 7 days ahead)

**Incorrect times displayed**
- Ensure server timezone is `America/New_York`
- Verify `TZ=America/New_York` in `.env`
- All times operate in EDT/EST

### Debug Tools
```bash
# View parsed tee sheet
curl http://localhost:3001/api/view/teesheet

# Check system health
curl http://localhost:3001/api/health

# Monitor logs in real-time
docker-compose logs -f app

# Database direct access
docker-compose exec db mysql -u root -p${DB_PASSWORD} ${DB_NAME}
```

## 📊 System Architecture

### Booking Timeline
```
Today (Thursday) 6:30 AM EDT
    ↓
Saturday: Books next Saturday (7 days ahead)
Sunday: Books next Sunday (7 days ahead)
    ↓
Every 30 minutes: Monitors for booking opportunities
    ↓
Maintains maximum 4 future weekends
```

### Authentication Flow
1. **RC4 Encryption** of stored credentials
2. **Two-step Login** with token exchange
3. **Session Management** with cookie persistence
4. **Auto Re-authentication** when sessions expire

### Booking Process
1. **Fetch Tee Sheet**: Retrieve available slots via HTTP
2. **Parse HTML**: Extract time slots using regex/cheerio
3. **Filter by Preferences**: Match user's time requirements
4. **Guest Assignment**: Select appropriate guest to avoid billing
5. **Submit Booking**: Execute reservation request
6. **Update Database**: Record results and status

## 🔒 Security Features

- **Encrypted Storage**: All passwords RC4 encrypted in database
- **Secure Sessions**: Token-based authentication
- **No Credential Logging**: Sensitive data excluded from logs
- **Environment Variables**: Configuration via secure env files
- **Database Security**: Prepared statements prevent SQL injection

## 📈 Performance & Monitoring

### Resource Usage
- **Memory**: ~100MB typical usage
- **CPU**: Minimal during idle, spikes during booking attempts
- **Network**: Golf site requests only during active booking
- **Storage**: Database grows ~1MB per month with typical usage

### Monitoring Points
- **Health Endpoint**: `/api/health` for uptime monitoring
- **Database Health**: Connection status and query performance
- **Booking Success Rate**: Track via weekend_booking_history table
- **Authentication Status**: Monitor login failures

## 🚦 System Limits & Behaviors

### Operational Limits
- **Weekend Maximum**: 4 future weekends at any time
- **Time Range**: Weekend bookings fixed to 7:50 AM - 1:00 PM
- **No Time Expansion**: Won't book outside preferred range
- **Rate Limiting**: Respects golf site server load

### Important Behaviors
- **Immediate Catch-up**: Books open weekends when enabled
- **No Retry on No Slots**: Saves resources when nothing available
- **Guest Rotation**: Automatically assigns different guests
- **Session Recovery**: Handles authentication expiration gracefully

## 📄 Project Information

**Version**: 2.0.0  
**Status**: Production Ready  
**License**: Private Use Only  
**Last Updated**: August 2025  

### Technology Stack
- **Frontend**: React 18, Tailwind CSS, Vite
- **Backend**: Node.js, Express.js
- **Database**: MySQL 8.0
- **Deployment**: Docker, Docker Compose
- **Automation**: node-cron, axios with cookie support

### Repository Structure
```
tee/
├── src/                    # React frontend source
├── public/                 # Static assets
├── server.js              # Express backend
├── bookingService.js      # Core booking logic
├── weekendAutomation.js   # Weekend automation
├── docker-compose.yml     # Docker services
├── Dockerfile            # Application container
├── package.json          # Dependencies
└── README.md            # This file
```

## 🤝 Support & Contributing

### Getting Help
1. Check this README thoroughly
2. Review troubleshooting section
3. Use debug endpoints for diagnostics
4. Check container logs for errors
5. Verify database state directly

### Development
```bash
# Development environment
npm run dev

# Frontend only (port 5173)
npm run dev:frontend

# Backend only (port 3001)
npm run dev:backend
```

### Contributing Guidelines
- Maintain existing code style
- Update documentation for changes
- Test with both manual and weekend booking modes
- Verify Docker deployment works
- Consider timezone implications for any time-related changes

---

⚠️ **Important**: This system interfaces with Trump National Colts Neck's booking system. Use responsibly and respect the golf club's terms of service. All booking times are in EDT/EST timezone.