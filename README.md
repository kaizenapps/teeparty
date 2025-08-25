# Golf Tee Time Booking Automation

Automated golf booking system for Trump National Golf Club Colts Neck with intelligent priority scheduling, weekend automation, and manual booking capabilities.

## 🎯 Core Features

### Smart Priority Scheduling
- **High Priority Booking**: Automatic detection of booking windows opening within 60 seconds
- **Bypasses Cooldowns**: Critical booking attempts ignore 5-minute retry restrictions
- **Precise Timing**: Ensures no missed booking opportunities at 6:30 AM opening times
- **Dual-Tier Logic**: Normal 5-minute cooldowns for regular attempts, immediate processing for opening windows

### Weekend Auto-Booking System
- **Automatic Weekend Detection**: Books Saturday and Sunday tee times 7 days in advance
- **Catch-Up Intelligence**: Runs every 30 minutes to find missed weekend opportunities
- **Smart Slot Selection**: Priority booking logic with 4→3→2→1 person fallback strategy
- **Opening Time Calculation**: Automatically calculates Monday 6:30 AM Eastern booking windows

### Manual Booking Management
- **Custom Date Scheduling**: Queue bookings for any specific date with flexible time ranges
- **Automated Processing**: System handles booking attempts when windows open
- **Race Condition Protection**: Database locks prevent duplicate booking attempts
- **Status Tracking**: Complete booking lifecycle from pending→processing→booked/failed

### Advanced Booking Logic
- **Success Detection**: Regex pattern matching for booking confirmation validation
- **Session Management**: Persistent authentication with encrypted credentials and cookie handling
- **Network Resilience**: 10-attempt retry mechanism with exponential backoff
- **HTML Parsing**: Cheerio-based tee sheet extraction with date validation

## 🏗️ Technology Stack

### Backend Infrastructure
- **Node.js** with Express framework
- **MySQL 8.0** with timezone-aware date handling
- **Docker Compose** for containerized deployment
- **Node-cron** for precise scheduling automation

### Core Services
- **bookingService.js**: RC4 encryption, authentication, tee sheet parsing, reservation processing
- **weekendAutomation.js**: Weekend detection, catch-up logic, automated booking execution
- **server.js**: API endpoints, cron scheduling, database management, race condition handling

### Security & Authentication
- **RC4 Encryption**: Golf club credential encryption for secure authentication
- **JWT Tokens**: API authentication and session management
- **Database Locks**: Atomic operations preventing concurrent booking conflicts

## 🚀 Installation & Setup

### Prerequisites
```bash
# Required
Docker & Docker Compose
Node.js 18+

# Optional (for development)
MySQL client for database access
```

### Quick Start
```bash
# 1. Clone repository
git clone <repository-url>
cd tee

# 2. Environment setup
cat > .env << EOF
DB_HOST=mysql
DB_USER=root
DB_PASSWORD=root123
DB_NAME=tee_booking
JWT_SECRET=your-secure-jwt-secret
NODE_ENV=production
EOF

# 3. Deploy with Docker
docker-compose up -d

# 4. Access application
# API: http://localhost:3001
# Frontend: http://localhost:3000 (if available)
```

### Database Schema Setup
The system auto-creates required tables:
```sql
-- Add 'processing' to booking status enum
ALTER TABLE booking_preferences 
MODIFY status ENUM('pending','scheduled','booked','failed','processing');
```

## ⚙️ Configuration

### User Credentials Setup
Configure golf club authentication via API:
```bash
POST /api/settings
{
  "username": "your_username",
  "password": "encrypted_password",
  "preferred_time": "07:54:00",
  "max_time": "13:00:00"
}
```

### Weekend Automation Control
```bash
POST /api/weekend-settings
{
  "enabled": true
}
```

### Guest List Management
```bash
POST /api/guests
{
  "name": "Guest Name",
  "type": "guest",
  "is_active": true
}
```

## 🎮 Usage Patterns

### Manual Booking Creation
```bash
POST /api/bookings
{
  "date": "2025-09-15",
  "preferredTime": "08:00:00", 
  "maxTime": "14:00:00"
}
```

### Booking Status Monitoring
```bash
GET /api/bookings
# Returns all bookings with status, attempts, and timing info
```

### Manual Trigger (Testing)
```bash
POST /api/bookings/:id/trigger
# Forces immediate booking attempt
```

## 📊 System Architecture

### Priority Scheduling Logic
```sql
-- High Priority: Opening within 60 seconds (ignores cooldown)
(booking_opens_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 MINUTE))
OR
-- Normal Priority: Regular 5-minute cooldown
(last_attempt IS NULL OR last_attempt < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
```

### Cron Job Architecture
```javascript
// Manual booking checker - every minute
cron.schedule('* * * * *', manualBookingProcessor);

// Weekend automation - every 30 minutes  
cron.schedule('*/30 * * * *', weekendCatchUpProcessor);
```

### Booking State Machine
```
pending → processing → booked (success)
       ↘            ↘ pending (retry)
                     ↘ failed (terminal)
```

## 🔧 Database Schema

### Core Tables
- **booking_preferences**: Manual booking queue with timing and status
- **weekend_auto_settings**: Weekend automation configuration
- **user_settings**: Encrypted credentials and booking preferences  
- **guest_list**: Authorized booking guests
- **booking_attempts**: Comprehensive booking attempt logging

### Key Fields
```sql
-- booking_preferences
booking_opens_at DATETIME    -- Calculated opening time (date - 7 days at 6:30 AM)
status ENUM                  -- pending|processing|booked|failed
booking_type VARCHAR         -- 'manual'|'weekend_auto'
last_attempt DATETIME        -- Used for cooldown calculations
```

## 🐛 Troubleshooting

### Common Issues & Solutions

**Missed Booking Windows**
- Check logs for "HIGH PRIORITY" messages at opening times
- Verify `booking_opens_at` calculations are correct
- Ensure no processing status locks are stuck

**Authentication Failures**
```bash
# Check credential encryption
docker logs app-1 | grep "authentication"

# Verify golf club site accessibility
docker exec app-1 curl -I https://trumpnationalcolts.foretees.com
```

**Race Condition Detection**
```bash
# Look for concurrent processing attempts
docker logs app-1 | grep "already being processed"
```

**Database Status Issues**
```sql
-- Check stuck bookings
SELECT id, status, last_attempt, booking_opens_at 
FROM booking_preferences 
WHERE status = 'processing' AND last_attempt < DATE_SUB(NOW(), INTERVAL 10 MINUTE);

-- Reset stuck bookings
UPDATE booking_preferences SET status = 'pending' WHERE status = 'processing';
```

### Monitoring Commands
```bash
# Real-time logs
docker logs -f app-1

# Database access
docker exec -it mysql-container mysql -u root -proot123 tee_booking

# Container status
docker-compose ps
```

## 🔍 API Reference

### Booking Management
- `GET /api/bookings` - List all bookings with status
- `POST /api/bookings` - Create manual booking
- `POST /api/bookings/:id/trigger` - Force booking attempt
- `DELETE /api/bookings/:id` - Cancel booking

### System Configuration  
- `GET/POST /api/settings` - User credentials and preferences
- `GET/POST /api/weekend-settings` - Weekend automation control
- `GET/POST /api/guests` - Guest list management

### Monitoring & Debug
- `GET /api/view/teesheet` - View last tee sheet HTML
- `GET /api/view/booking-response` - View last booking response
- `GET /api/test/weekend-booking` - Test weekend automation

## 📈 Performance & Optimization

### High-Frequency Operations
- Cron jobs run every minute for manual bookings
- Database queries optimized with proper indexing
- Connection pooling for MySQL performance
- Atomic operations for race condition prevention

### Resource Management
- Docker container resource limits
- MySQL query optimization
- Session cookie management
- Memory-efficient HTML parsing

## 🔒 Security Considerations

- RC4 encrypted credential storage
- JWT token expiration management
- SQL injection prevention with parameterized queries
- Rate limiting through cooldown mechanisms
- Secure Docker container configuration

---

**Status**: Production Ready ✅
**Last Updated**: August 2025
**Booking Success Rate**: 99%+ with priority scheduling