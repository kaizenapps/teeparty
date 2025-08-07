# ⛳ Golf Tee Time Automation System

An automated booking system for Trump National Colts Neck golf course that handles both manual and weekend auto-booking with intelligent scheduling and retry logic.

## 🌟 Features

### Core Features
- **Automated Tee Time Booking**: Books slots exactly when they open (7 days in advance at 6:30 AM EDT)
- **Weekend Auto-Booking**: Automatically books every Saturday and Sunday
- **Smart Authentication**: Handles encrypted login with session management
- **Guest Management**: Pre-configured guest list to avoid member billing
- **Real-time Status Updates**: Auto-refresh UI with database-driven status
- **Intelligent Retry Logic**: Won't retry if no slots in preferred time range

### Manual Booking Features
- Schedule bookings for any date
- Custom time range preferences (preferred time → max acceptable time)
- Automatic attempts when booking window opens
- Manual trigger for testing
- Activity logs for each booking attempt

### Weekend Auto-Booking Features
- **Immediate Catch-Up**: Books already-open weekends when enabled
- **30-Minute Checks**: Regular checks for bookable weekends
- **Real-Time Booking**: Books exactly at 6:30 AM EDT on weekends
- **Fixed Time Range**: 7:50 AM - 1:00 PM (no expansion)
- **4-Weekend Limit**: Maximum of 4 weekends booked at once
- **Smart Status Tracking**: Database-driven status (No Slots, Booked, Attempting, etc.)

### UI Features
- React-based dashboard with Tailwind CSS
- Three tabs: Manual Bookings, Weekend Auto-Booking, Settings
- Auto-refresh with visual indicators
- Color-coded status badges
- Real-time booking history
- Responsive design

## 📋 Prerequisites

- Node.js (v14 or higher)
- MySQL 8.0+
- npm or yarn
- Golf club account credentials

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd golf-booking-system
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Setup

Create a MySQL database:
```bash
mysql -u root -p
CREATE DATABASE golf_booking;
USE golf_booking;
```

Import the database schema:
```sql
-- Create tables
CREATE TABLE IF NOT EXISTS `user_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password_encrypted` text NOT NULL,
  `session_token` text,
  `cookies` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `booking_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `date` date NOT NULL,
  `preferred_time` time NOT NULL DEFAULT '07:54:00',
  `max_time` time NOT NULL DEFAULT '13:00:00',
  `status` enum('pending','scheduled','booked','failed') DEFAULT 'pending',
  `booking_type` enum('manual','weekend_auto') DEFAULT 'manual',
  `attempts` int DEFAULT '0',
  `last_attempt` timestamp NULL DEFAULT NULL,
  `booking_opens_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_booking_date_type` (`date`,`booking_type`),
  KEY `idx_booking_status_type` (`status`,`booking_type`),
  CONSTRAINT `booking_preferences_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user_settings` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `booking_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `preference_id` int DEFAULT NULL,
  `action` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `message` text,
  `response_data` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `preference_id` (`preference_id`),
  CONSTRAINT `booking_logs_ibfk_1` FOREIGN KEY (`preference_id`) REFERENCES `booking_preferences` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `guest_list` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guest_id` varchar(50) NOT NULL,
  `guest_name` varchar(255) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `weekend_auto_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT '1',
  `is_enabled` tinyint(1) DEFAULT '1',
  `preferred_start_time` time DEFAULT '07:50:00',
  `preferred_end_time` time DEFAULT '13:00:00',
  `last_saturday_booked` date DEFAULT NULL,
  `last_sunday_booked` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `weekend_auto_settings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user_settings` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `weekend_booking_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `target_date` date NOT NULL,
  `day_of_week` enum('Saturday','Sunday') NOT NULL,
  `booking_opened_at` datetime DEFAULT NULL,
  `attempt_started_at` datetime DEFAULT NULL,
  `attempt_ended_at` datetime DEFAULT NULL,
  `status` enum('success','failed','no_slots','already_booked') DEFAULT NULL,
  `booked_time` varchar(20) DEFAULT NULL,
  `attempts` int DEFAULT '0',
  `error_message` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_weekend_target_date` (`target_date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default guests
INSERT INTO `guest_list` (`guest_id`, `guest_name`, `is_active`) VALUES
  ('1036745_Guest', 'Bajramovic, Diana', 1),
  ('1051175_Guest', 'belpedio, louie', 1),
  ('1036744_Guest', 'Francese, Dennis', 1);

-- Insert default weekend settings
INSERT INTO `weekend_auto_settings` (`user_id`, `is_enabled`) VALUES (1, 0);
```

### 4. Environment Configuration

Create a `.env` file in the root directory:
```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=golf_booking

# Server Configuration
PORT=3001

# Golf Site Configuration
GOLF_SITE_URL=https://www.trumpcoltsneck.com
COURSE_ID=95

# Time Zone (important for booking times)
TZ=America/New_York
```

### 5. Build the Frontend
```bash
npm run build
```

## 🖥️ Deployment

### Development Mode
```bash
# Runs frontend on port 5173 and backend on port 3001
npm run dev
```

### Production Mode
```bash
# Build and start production server
npm run build
npm run start:prod

# Or simply
npm start
```

The application will be available at: http://localhost:3001

## ⚙️ Configuration

### Initial Setup

1. **Navigate to the web interface**: http://localhost:3001

2. **Configure Credentials** (Settings Tab):
    - Enter your golf club username
    - Enter your golf club password
    - Click "Update & Verify Credentials"

3. **Enable Weekend Auto-Booking** (Weekend Auto-Booking Tab):
    - Click "Enable" to activate weekend automation
    - System will immediately check for available weekends

### Guest Configuration

Guests are pre-configured in the database to avoid member billing. To modify:
```sql
UPDATE guest_list SET guest_name = 'New Guest Name' WHERE id = 1;
```

## 📱 Usage

### Manual Booking

1. Go to "Manual Bookings" tab
2. Select a date (optionally filter weekends only)
3. Set preferred time (e.g., 7:54 AM)
4. Set maximum acceptable time (e.g., 1:00 PM)
5. Click "Add Booking"

The system will automatically attempt to book when the window opens.

### Weekend Auto-Booking

1. Go to "Weekend Auto-Booking" tab
2. Click "Enable" to activate
3. System will:
    - Immediately check all open weekends
    - Check every 30 minutes for new opportunities
    - Book at exactly 6:30 AM EDT on Sat/Sun for 7 days ahead

### Status Indicators

- 🟢 **Booking window OPEN** - Can be booked now
- 🔄 **Checking for Slots** - System is searching
- ❌ **No Slots Available** - No times in preferred range
- ⏳ **Scheduled** - Will book when window opens
- ✅ **Booked** - Successfully reserved
- ⏸️ **Manual Only** - Auto-booking disabled

## 🔄 How It Works

### Booking Timeline
```
Today (Thursday)
    ↓
Saturday: Books next Saturday (7 days ahead) at 6:30 AM EDT
Sunday: Books next Sunday (7 days ahead) at 6:30 AM EDT
    ↓
Every 30 minutes: Checks for any bookable weekends
```

### Authentication Process
1. RC4 encryption of credentials
2. Two-step login with token exchange
3. Session management with cookies
4. Automatic re-authentication when needed

### Booking Process
1. Fetches tee sheet HTML
2. Parses available slots using regex/cheerio
3. Filters by time preferences
4. Attempts booking with pre-configured guests
5. Updates database with results

## 🔌 API Endpoints

### Settings
- `GET /api/settings` - Get user settings
- `POST /api/settings/credentials` - Update credentials

### Bookings
- `GET /api/bookings` - Get all bookings
- `POST /api/bookings` - Add manual booking
- `DELETE /api/bookings/:id` - Delete booking
- `POST /api/bookings/:id/trigger` - Manual trigger

### Weekend Automation
- `GET /api/weekend-settings` - Get weekend settings
- `POST /api/weekend-settings` - Toggle weekend booking
- `GET /api/upcoming-weekends` - Get weekend schedule
- `GET /api/weekend-history` - Get booking history

### Debug
- `GET /api/view/teesheet` - View parsed tee sheet
- `GET /api/debug/slots` - Debug slot parsing
- `GET /api/health` - Health check

## 🗄️ Database Schema

### Key Tables
- `user_settings` - Encrypted credentials and session
- `booking_preferences` - Scheduled bookings
- `booking_logs` - Attempt history
- `guest_list` - Pre-configured guests
- `weekend_auto_settings` - Weekend automation config
- `weekend_booking_history` - Weekend attempt tracking

## 🐛 Troubleshooting

### Common Issues

**"No slots available"**
- This is normal if all slots in 7:50 AM - 1:00 PM are booked
- You can manually book afternoon slots if needed

**"Authentication failed"**
- Verify your credentials in Settings
- Check if your account is active on the golf site

**Weekend not booking**
- Ensure weekend auto-booking is enabled
- Check that you haven't reached the 4-weekend limit
- Verify the booking window is actually open

**Times showing incorrectly**
- Ensure your server timezone is set to America/New_York
- All times are in EDT/EST

### Debug Mode

View the parsed tee sheet:
```
http://localhost:3001/api/view/teesheet
```

Check server logs:
```bash
# View real-time logs
npm run dev

# Check for cron job execution
# Look for messages like:
# 🔄 Running weekend catch-up check...
# 🎯 WEEKEND REAL-TIME BOOKING WINDOW!
```

## 📝 Important Notes

1. **Time Zone**: All operations use EDT/EST timezone
2. **Booking Window**: Slots open exactly 7 days in advance at 6:30 AM EDT
3. **Rate Limiting**: System respects the golf site's server load
4. **Guest Billing**: Pre-configured guests avoid member charges
5. **Weekend Limit**: Maximum 4 weekends booked at once
6. **No Expansion**: Weekend bookings won't expand beyond 1:00 PM

## 🔒 Security

- Passwords are base64 encrypted in database
- Session tokens are managed securely
- No credentials in logs
- Environment variables for sensitive config

## 📄 License

Private use only. Not for commercial distribution.

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. View debug endpoints
3. Check server logs
4. Verify database entries

## 🚦 System Status

Monitor system health:
- Health Check: http://localhost:3001/api/health
- Weekend History: Check the Weekend Auto-Booking tab
- Booking Logs: View activity in each booking card

---

**Last Updated**: August 2025
**Version**: 1.0.0
**Status**: Production Ready