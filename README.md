# Golf Tee Time Booking Automation

Automated golf booking system for Trump National Golf Club Colts Neck with smart priority scheduling and weekend automation.

## 🎯 Features

### Smart Priority Scheduling
- **High Priority**: Bookings opening within 60 seconds bypass cooldowns
- **Normal Priority**: Open booking windows retry every minute  
- **No Wasted Attempts**: Only processes bookings at appropriate times

### Weekend Auto-Booking
- **Automatic**: Books Saturday and Sunday slots 7 days in advance at 6:30 AM Eastern
- **Catch-Up Mode**: Runs every 30 minutes to find missed opportunities
- **Fallback Logic**: 4→3→2→1 person slot priority with intelligent selection

### Manual Booking Management
- **Custom Scheduling**: Queue bookings for any date with flexible time ranges
- **Race Condition Protection**: Database locks prevent duplicate attempts
- **Success Detection**: Regex pattern matching for booking confirmation

### Technical Features
- **RC4 Encryption**: Golf club credential security
- **Session Management**: Persistent authentication with cookie handling
- **Network Resilience**: 10-attempt retry with exponential backoff
- **Timezone Aware**: All operations in Eastern Time (EDT/EST)

## 🚀 Deployment

### Quick Start
```bash
# 1. Clone and setup environment
git clone <repository-url>
cd tee
cp .env.example .env  # Edit with your settings

# 2. Deploy with Docker
docker-compose up -d

# 3. Access application
open http://localhost:3001
```

### Environment Variables
```env
# Database
DB_HOST=mysql
DB_USER=root
DB_PASSWORD=root123
DB_NAME=tee_booking

# Application  
PORT=3001
NODE_ENV=production
TZ=America/New_York

# Golf Site (optional)
GOLF_SITE_URL=https://www.trumpcoltsneck.com
COURSE_ID=95
```

### Database Setup
```sql
-- Add processing status to enum (run once)
ALTER TABLE booking_preferences 
MODIFY status ENUM('pending','scheduled','booked','failed','processing');
```

## 📊 Logs & Monitoring

### Real-time Logs
```bash
# View live application logs
docker logs -f app-1

# Specific log filtering
docker logs app-1 | grep "HIGH PRIORITY"
docker logs app-1 | grep "SUCCESS"
```

### Key Log Messages
```bash
🚨 HIGH PRIORITY booking X - opens in Ys    # Priority scheduling active
🔄 NORMAL PRIORITY booking X - window open   # Regular retry mode
✅ Successfully booked DATE at TIME         # Booking success
❌ Failed to book DATE: REASON              # Booking failure
⚠️ Booking X already being processed       # Race condition prevented
```

### Application Status
```bash
# Check container health
docker-compose ps

# View system health
curl http://localhost:3001/api/health

# Monitor booking attempts
curl http://localhost:3001/api/bookings
```

## 💾 Database Export/Import

### Export Database
```bash
# Full database backup
docker exec mysql-container mysqldump -u root -proot123 tee_booking > backup.sql

# Specific tables only
docker exec mysql-container mysqldump -u root -proot123 tee_booking \
  booking_preferences user_settings guest_list > essential_backup.sql

# Timestamped backup
docker exec mysql-container mysqldump -u root -proot123 tee_booking \
  > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

### Import Database
```bash
# Restore full database
docker exec -i mysql-container mysql -u root -proot123 tee_booking < backup.sql

# Import specific backup
cat backup_20250825_063000.sql | docker exec -i mysql-container mysql -u root -proot123 tee_booking

# Verify import
docker exec mysql-container mysql -u root -proot123 -e "SELECT COUNT(*) FROM tee_booking.booking_preferences;"
```

### Database Access
```bash
# Direct MySQL access
docker exec -it mysql-container mysql -u root -proot123 tee_booking

# Common queries
SELECT * FROM booking_preferences WHERE status = 'pending';
SELECT * FROM booking_attempts ORDER BY created_at DESC LIMIT 10;
SELECT * FROM weekend_auto_settings;
```

### Data Migration
```bash
# Export settings only
docker exec mysql-container mysqldump -u root -proot123 tee_booking \
  user_settings weekend_auto_settings guest_list > settings_only.sql

# Export booking history  
docker exec mysql-container mysqldump -u root -proot123 tee_booking \
  booking_attempts weekend_booking_history > history_only.sql
```

## ⚙️ Configuration

### Credentials Setup
1. Access http://localhost:3001
2. Go to **Settings** tab
3. Enter golf club username/password
4. Click "Update & Verify Credentials"

### Weekend Automation
1. Go to **Weekend Auto-Booking** tab
2. Toggle "Enable" to activate
3. System runs immediate catch-up check
4. Monitors every 30 minutes thereafter

## 🔧 Maintenance

### Container Management
```bash
# Restart application
docker-compose restart app

# Update application
docker-compose pull
docker-compose up -d --build

# Clean restart
docker-compose down
docker-compose up -d
```

### Database Maintenance
```bash
# Reset stuck bookings
docker exec mysql-container mysql -u root -proot123 -e \
  "UPDATE tee_booking.booking_preferences SET status='pending' WHERE status='processing';"

# Clean old logs (keep last 1000)
docker exec mysql-container mysql -u root -proot123 -e \
  "DELETE FROM tee_booking.booking_attempts WHERE id NOT IN (SELECT id FROM (SELECT id FROM tee_booking.booking_attempts ORDER BY created_at DESC LIMIT 1000) as t);"
```

---

**Status**: Production Ready ✅  
**Last Updated**: August 2025  
**Timezone**: Eastern Time (EDT/EST)