// server.js - Complete Updated Server with Enhanced Weekend Automation
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import GolfBookingService from './bookingService.js';
import WeekendAutomation from './weekendAutomation.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Simple JWT-like token generation for demo purposes
function generateAuthToken(username) {
    return Buffer.from(`${username}:${Date.now()}`).toString('base64');
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        // Simple token validation - in production use proper JWT
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        const [username, timestamp] = decoded.split(':');
        
        // Token expires after 24 hours
        if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) {
            return res.status(401).json({ error: 'Token expired' });
        }

        req.user = { username };
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Serve static files from the React build
app.use(express.static(path.join(__dirname, 'dist')));

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'golf_booking',
    // Removed timezone: '+00:00' to prevent date conversion issues
    // Dates will now be handled in local timezone
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
const bookingService = new GolfBookingService();
let weekendAutomation;

// Initialize database connection
async function initDB() {
    try {
        pool = mysql.createPool(dbConfig);
        await pool.query('SELECT 1');
        console.log('✅ Database connected successfully');

        // Initialize weekend automation after DB is ready
        weekendAutomation = new WeekendAutomation(pool);
        console.log('⛳ Weekend Automation initialized');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.log('Retrying database connection in 5 seconds...');
        setTimeout(() => {
            initDB();
        }, 5000);
        return;
    }
}

// Helper function to log booking attempts
async function logBookingAttempt(preferenceId, action, status, message, responseData = null) {
    try {
        await pool.query(
            'INSERT INTO booking_logs (preference_id, action, status, message, response_data) VALUES (?, ?, ?, ?, ?)',
            [preferenceId, action, status, message, responseData ? JSON.stringify(responseData) : null]
        );
    } catch (error) {
        console.error('Error logging booking attempt:', error);
    }
}

// Process a booking
async function processBooking(booking, userSettings) {
    try {
        console.log(`📅 Processing booking for ${booking.date}`);

        // Authenticate if needed
        if (!bookingService.cookies || !bookingService.sessionToken) {
            console.log('🔐 Authenticating...');
            const username = userSettings.username;
            const password = Buffer.from(userSettings.password_encrypted, 'base64').toString();

            const authResult = await bookingService.authenticate(username, password);

            if (!authResult.success) {
                throw new Error(`Authentication failed: ${authResult.error}`);
            }

            // Update stored session
            await pool.query(
                'UPDATE user_settings SET session_token = ?, cookies = ? WHERE id = ?',
                [authResult.token, authResult.cookies, userSettings.id]
            );
        }

        // Get guest list
        const [guests] = await pool.query(
            'SELECT * FROM guest_list WHERE is_active = 1 LIMIT 3'
        );

        if (guests.length < 3) {
            throw new Error('Not enough guests configured');
        }

        // Ensure date is a proper Date object
        let bookingDate;
        if (typeof booking.date === 'string') {
            if (booking.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                bookingDate = new Date(booking.date + 'T12:00:00');
            } else {
                bookingDate = new Date(booking.date);
            }
        } else {
            bookingDate = new Date(booking.date);
        }
        

        // Try to book
        const result = await bookingService.findAndBookBestSlot(
            bookingDate,
            booking.preferred_time,
            booking.max_time,
            guests
        );

        return result;
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// API Routes - All prefixed with /api

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }

        console.log('🔐 Authenticating user:', username);

        // Get admin credentials from environment variables
        const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'golf123';

        if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
            console.log('❌ Invalid credentials');
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        console.log('✅ Authentication successful');

        // Check if user settings exist and get the golf credentials
        const [existing] = await pool.query('SELECT username as golf_username, password_encrypted FROM user_settings WHERE id = 1');

        if (existing.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Golf club credentials not configured. Please set up your golf club username and password first.' 
            });
        }

        // Generate auth token for the app
        const appToken = generateAuthToken(username);

        res.json({
            success: true,
            message: 'Authentication successful',
            token: appToken,
            user: {
                username: username,
                golf_username: existing[0].golf_username,
                id: 1
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, username FROM user_settings WHERE id = 1');
        if (rows.length > 0) {
            res.json({
                success: true,
                user: {
                    id: rows[0].id,
                    username: rows[0].username
                }
            });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

// Get user settings
app.get('/api/settings', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, username, created_at, updated_at FROM user_settings WHERE id = 1');
        res.json(rows[0] || { username: '' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update and verify credentials
app.post('/api/settings/credentials', authenticateToken, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }

        console.log('🔐 Testing authentication for:', username);

        // Test authentication with golf site
        const authResult = await bookingService.authenticate(username, password);

        if (authResult.success) {
            // Store encrypted credentials
            const encryptedPassword = Buffer.from(password).toString('base64');

            const [existing] = await pool.query('SELECT id FROM user_settings WHERE id = 1');

            if (existing.length > 0) {
                await pool.query(
                    'UPDATE user_settings SET username = ?, password_encrypted = ?, session_token = ?, cookies = ? WHERE id = 1',
                    [username, encryptedPassword, authResult.token, '']
                );
            } else {
                await pool.query(
                    'INSERT INTO user_settings (username, password_encrypted, session_token, cookies) VALUES (?, ?, ?, ?)',
                    [username, encryptedPassword, authResult.token, '']
                );
            }

            res.json({ success: true, message: 'Credentials verified and saved successfully!' });
        } else {
            res.status(400).json({ success: false, message: `Authentication failed: ${authResult.error}` });
        }
    } catch (error) {
        console.error('Credential update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get weekend auto-booking settings
app.get('/api/weekend-settings', authenticateToken, async (req, res) => {
    try {
        const [settings] = await pool.query('SELECT * FROM weekend_auto_settings WHERE user_id = 1');

        if (settings.length === 0) {
            // Create default settings
            await pool.query(
                'INSERT INTO weekend_auto_settings (user_id) VALUES (1)'
            );
            const [newSettings] = await pool.query('SELECT * FROM weekend_auto_settings WHERE user_id = 1');
            res.json(newSettings[0]);
        } else {
            res.json(settings[0]);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update weekend auto-booking settings (ENHANCED VERSION)
app.post('/api/weekend-settings', authenticateToken, async (req, res) => {
    try {
        const { enabled } = req.body;

        await pool.query(
            'UPDATE weekend_auto_settings SET is_enabled = ? WHERE user_id = 1',
            [enabled]
        );

        // If enabling, immediately run catch-up check
        if (enabled && weekendAutomation) {
            console.log('🚀 Weekend auto-booking enabled - running immediate catch-up check...');

            // Run catch-up in background (don't wait for it)
            setTimeout(async () => {
                await weekendAutomation.executeCatchUpBookings();
            }, 1000);

            res.json({
                success: true,
                message: `Weekend auto-booking enabled! Running immediate check for available weekends...`
            });
        } else {
            res.json({
                success: true,
                message: `Weekend auto-booking ${enabled ? 'enabled' : 'disabled'}`
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get upcoming weekends status
app.get('/api/upcoming-weekends', authenticateToken, async (req, res) => {
    try {
        const weekends = await weekendAutomation.getUpcomingWeekends();
        res.json(weekends);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get weekend booking history
app.get('/api/weekend-history', authenticateToken, async (req, res) => {
    try {
        const [history] = await pool.query(
            `SELECT * FROM weekend_booking_history 
             ORDER BY created_at DESC 
             LIMIT 20`
        );
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all bookings
app.get('/api/bookings', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, user_id, DATE_FORMAT(date, '%c/%e/%Y') as date_formatted,
                    DATE_FORMAT(date, '%M %e, %Y') as date_long_format,
                 date as date_raw, preferred_time, max_time, status, attempts,
                 last_attempt, booking_opens_at, created_at, booking_type
             FROM booking_preferences
             WHERE date >= CURDATE()
             ORDER BY date ASC, preferred_time ASC`
        );

        // Format dates properly for frontend display
        const formattedRows = rows.map(row => {
            const dateObj = new Date(row.date_raw);
            return {
                ...row,
                date: `Scheduled for ${row.date_long_format}`,
                date_display: row.date_formatted,
                date_string: row.date_long_format,
                date_safe: dateObj.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                booking_opens_at: new Date(row.booking_opens_at).toLocaleString('en-US'),
                created_at: new Date(row.created_at).toLocaleString('en-US'),
                last_attempt: row.last_attempt ? new Date(row.last_attempt).toLocaleString('en-US') : null,
                is_weekend_auto: row.booking_type === 'weekend_auto'
            };
        });

        res.json(formattedRows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new booking preference (manual)
app.post('/api/bookings', authenticateToken, async (req, res) => {
    try {
        const { date, preferredTime, maxTime } = req.body;

        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        // Calculate when booking opens (1 week prior at 6:30 AM Eastern)
        // Ensure we use noon local time to avoid timezone conversion issues
        const bookingDate = new Date(date + 'T12:00:00');
        const opensAt = new Date(bookingDate);
        opensAt.setDate(opensAt.getDate() - 7);
        opensAt.setHours(6, 30, 0, 0);

        // Check for duplicate using the processed booking date
        const [existing] = await pool.query(
            'SELECT id FROM booking_preferences WHERE user_id = 1 AND date = ?',
            [bookingDate]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Booking already exists for this date' });
        }

        // Store the processed date object (with proper timezone) instead of the raw string
        const [result] = await pool.query(
            'INSERT INTO booking_preferences (user_id, date, preferred_time, max_time, booking_opens_at, status, booking_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [1, bookingDate, preferredTime || '07:54:00', maxTime || '13:00:00', opensAt, 'pending', 'manual']
        );

        await logBookingAttempt(result.insertId, 'created', 'info', `Manual booking scheduled for ${date}`);

        res.json({
            success: true,
            id: result.insertId,
            opensAt: opensAt.toISOString(),
            message: `Booking scheduled! Will attempt at ${opensAt.toLocaleString()}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete booking
app.delete('/api/bookings/:id', authenticateToken, async (req, res) => {
    try {
        // Delete logs first (foreign key constraint)
        await pool.query('DELETE FROM booking_logs WHERE preference_id = ?', [req.params.id]);

        // Then delete the booking
        const [result] = await pool.query(
            'DELETE FROM booking_preferences WHERE id = ? AND user_id = 1',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get booking logs
app.get('/api/logs/:preferenceId', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM booking_logs WHERE preference_id = ? ORDER BY created_at DESC LIMIT 20',
            [req.params.preferenceId]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual trigger for testing
app.post('/api/bookings/:id/trigger', authenticateToken, async (req, res) => {
    try {
        const [bookings] = await pool.query(
            'SELECT * FROM booking_preferences WHERE id = ? AND user_id = 1',
            [req.params.id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const booking = bookings[0];
        const [userSettings] = await pool.query('SELECT * FROM user_settings WHERE id = 1');

        if (!userSettings[0]?.username) {
            return res.status(400).json({ error: 'Please configure credentials first' });
        }

        // Convert date properly
        let bookingDate;
        if (typeof booking.date === 'string' || booking.date instanceof Date) {
            const dateStr = booking.date.toString();
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                bookingDate = new Date(dateStr + 'T12:00:00');
            } else {
                bookingDate = new Date(dateStr);
            }
        } else {
            bookingDate = new Date(booking.date);
        }

        console.log(`⚡ Manual trigger for booking ${booking.id}`);
        console.log(`Date string from DB: ${booking.date}`);
        console.log(`Date object: ${bookingDate}`);
        console.log(`Formatted: ${bookingDate.getMonth() + 1}/${bookingDate.getDate()}/${bookingDate.getFullYear()}`);
        console.log(`Preferred time: ${booking.preferred_time}`);
        console.log(`Max time: ${booking.max_time}`);

        await logBookingAttempt(booking.id, 'manual_trigger', 'info', 'Manual booking attempt started');

        // Authenticate
        const username = userSettings[0].username;
        const password = Buffer.from(userSettings[0].password_encrypted, 'base64').toString();

        const authResult = await bookingService.authenticate(username, password);
        if (!authResult.success) {
            throw new Error('Authentication failed');
        }

        // Get tee sheet
        const teeSheet = await bookingService.getTeeSheet(bookingDate);

        console.log('Tee sheet results:', {
            available: teeSheet.available,
            totalSlots: teeSheet.slots ? teeSheet.slots.length : 0,
            firstFewSlots: teeSheet.slots ? teeSheet.slots.slice(0, 3) : []
        });

        if (!teeSheet.available) {
            return res.json({
                success: false,
                message: teeSheet.message || 'Tee sheet not available',
                countdown: teeSheet.countdown
            });
        }

        // Filter by time preference
        const preferredTimeMin = bookingService.timeToMinutes(booking.preferred_time);
        const maxTimeMin = bookingService.timeToMinutes(booking.max_time);

        console.log(`Time range: ${booking.preferred_time} (${preferredTimeMin} min) to ${booking.max_time} (${maxTimeMin} min)`);

        // Try to find slots with priority: 4 spots > 3 spots > 2 spots > 1 spot
        let availableSlots = [];
        let slotsType = '';

        // Priority 1: Try 4-person slots first
        availableSlots = teeSheet.slots.filter(slot => {
            const slotMin = bookingService.timeToMinutes(slot.time);
            const inRange = slotMin >= preferredTimeMin && slotMin <= maxTimeMin;
            const is4Spots = slot.availableSpots === 4;
            console.log(`Checking slot ${slot.time} (${slotMin} min, ${slot.availableSpots}/4 spots): ${inRange && is4Spots ? 'PERFECT MATCH' : 'NO'}`);
            return inRange && is4Spots;
        });

        if (availableSlots.length > 0) {
            slotsType = '4-person (full)';
            console.log(`✅ Found ${availableSlots.length} perfect 4-person slots`);
        } else {
            // Priority 2: Try 3-person slots
            availableSlots = teeSheet.slots.filter(slot => {
                const slotMin = bookingService.timeToMinutes(slot.time);
                const inRange = slotMin >= preferredTimeMin && slotMin <= maxTimeMin;
                const is3Spots = slot.availableSpots === 3;
                console.log(`Checking slot ${slot.time} (${slotMin} min, ${slot.availableSpots}/4 spots): ${inRange && is3Spots ? 'GOOD MATCH' : 'NO'}`);
                return inRange && is3Spots;
            });

            if (availableSlots.length > 0) {
                slotsType = '3-person';
                console.log(`⚡ Found ${availableSlots.length} good 3-person slots`);
            } else {
                // Priority 3: Try 2-person slots
                availableSlots = teeSheet.slots.filter(slot => {
                    const slotMin = bookingService.timeToMinutes(slot.time);
                    const inRange = slotMin >= preferredTimeMin && slotMin <= maxTimeMin;
                    const is2Spots = slot.availableSpots === 2;
                    console.log(`Checking slot ${slot.time} (${slotMin} min, ${slot.availableSpots}/4 spots): ${inRange && is2Spots ? 'OK MATCH' : 'NO'}`);
                    return inRange && is2Spots;
                });

                if (availableSlots.length > 0) {
                    slotsType = '2-person';
                    console.log(`⚠️ Found ${availableSlots.length} partial 2-person slots`);
                } else {
                    // Priority 4: Try 1-person slots (last resort)
                    availableSlots = teeSheet.slots.filter(slot => {
                        const slotMin = bookingService.timeToMinutes(slot.time);
                        const inRange = slotMin >= preferredTimeMin && slotMin <= maxTimeMin;
                        const is1Spot = slot.availableSpots === 1;
                        console.log(`Checking slot ${slot.time} (${slotMin} min, ${slot.availableSpots}/4 spots): ${inRange && is1Spot ? 'LAST RESORT' : 'NO'}`);
                        return inRange && is1Spot;
                    });

                    if (availableSlots.length > 0) {
                        slotsType = '1-person (last resort)';
                        console.log(`🚨 Found ${availableSlots.length} single spots (last resort)`);
                    }
                }
            }
        }

        console.log(`Found ${availableSlots.length} ${slotsType} slots in preferred time range`);

        if (availableSlots.length === 0) {
            return res.json({
                success: false,
                message: `No slots between ${booking.preferred_time} and ${booking.max_time}`,
                debug: {
                    totalAvailable: teeSheet.slots.length,
                    allSlots: teeSheet.slots.map(s => ({
                        time: s.time,
                        spots: s.availableSpots
                    })),
                    preferredRange: `${booking.preferred_time} - ${booking.max_time}`,
                    preferredMinutes: `${preferredTimeMin} - ${maxTimeMin} minutes`
                }
            });
        }

        // Try to book
        const targetSlot = availableSlots[0];
        console.log('Attempting to book slot:', targetSlot);

        const [guests] = await pool.query('SELECT * FROM guest_list WHERE is_active = 1 LIMIT 3');
        const result = await bookingService.makeReservation(targetSlot, guests, userSettings[0].username);

        if (result.success) {
            await pool.query(
                'UPDATE booking_preferences SET status = ?, attempts = attempts + 1, last_attempt = NOW() WHERE id = ?',
                ['booked', booking.id]
            );

            await logBookingAttempt(booking.id, 'manual_trigger', 'success',
                `Successfully booked: ${targetSlot.time}`, result);
        } else {
            await pool.query(
                'UPDATE booking_preferences SET attempts = attempts + 1, last_attempt = NOW() WHERE id = ?',
                [booking.id]
            );

            await logBookingAttempt(booking.id, 'manual_trigger', 'failed',
                result.message || result.error || 'Unknown error', result);
        }

        res.json(result);
    } catch (error) {
        console.error('Manual trigger error:', error);
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

// Debug endpoints

// View tee sheet results in HTML
app.get('/api/view/teesheet', async (req, res) => {
    try {
        if (!fs.existsSync('teesheet.html')) {
            return res.status(404).json({
                error: 'No teesheet.html file found',
                hint: 'Run a booking trigger first to generate the file'
            });
        }

        const html = fs.readFileSync('teesheet.html', 'utf8');

        // Decode HTML entities
        const decodedHtml = html
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&');

        // Extract all LaunchReserver calls
        const launchReserverCalls = [];
        const regex = /LaunchReserver\(([^)]+)\)/g;
        let match;

        while ((match = regex.exec(decodedHtml)) !== null) {
            const params = match[1].match(/['"]([^'"]*)['"]/g);
            if (params && params.length >= 6) {
                const cleanParams = params.map(p => p.replace(/['"]/g, ''));
                launchReserverCalls.push({
                    raw: match[0],
                    courseId: cleanParams[0],
                    date: cleanParams[1],
                    time: cleanParams[2],
                    tee: cleanParams[3],
                    currentPlayers: parseInt(cleanParams[4]),
                    availableSpots: parseInt(cleanParams[5])
                });
            }
        }

        const availableSlots = launchReserverCalls.filter(slot => slot.availableSpots > 0);

        const titleMatch = decodedHtml.match(/<title>(.*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1] : 'No title';

        const pageType = {
            isLoginPage: decodedHtml.includes('txtUsername'),
            isBookingPage: decodedHtml.includes('BookTeeTime'),
            isCountdownPage: decodedHtml.includes('ncDateNotOpen'),
            isMemberPage: decodedHtml.includes('MembersDefault')
        };

        let actualPageType = 'Unknown';
        if (pageType.isLoginPage) actualPageType = 'Login Page';
        else if (pageType.isCountdownPage) actualPageType = 'Countdown/Not Open Page';
        else if (pageType.isBookingPage) actualPageType = 'Booking Page';
        else if (pageType.isMemberPage) actualPageType = 'Member Page';

        const htmlResponse = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tee Sheet Debug View</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        h1 { color: #333; }
        .info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .success { background: #c8e6c9; }
        .error { background: #ffcdd2; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border: 1px solid #ddd; }
        th { background: #4CAF50; color: white; }
        .slot-available { background: #e8f5e9; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔍 Tee Sheet Debug View</h1>
        
        <div class="info ${actualPageType === 'Booking Page' ? 'success' : 'error'}">
          <strong>Page Type:</strong> ${actualPageType}<br>
          <strong>Page Title:</strong> ${pageTitle}<br>
          <strong>HTML Size:</strong> ${html.length} bytes
        </div>
        
        <h2>⛳ Available Tee Times</h2>
        ${availableSlots.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Date</th>
                <th>Tee</th>
                <th>Available Spots</th>
                <th>Current Players</th>
              </tr>
            </thead>
            <tbody>
              ${availableSlots.map(slot => `
                <tr class="slot-available">
                  <td><strong>${slot.time}</strong></td>
                  <td>${slot.date}</td>
                  <td>${slot.tee === '1' ? '1st' : slot.tee}${slot.tee === '1' ? 'st' : 'th'} TEE</td>
                  <td>${slot.availableSpots}</td>
                  <td>${slot.currentPlayers}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="info">No available slots found</div>'}
      </div>
    </body>
    </html>
    `;

        res.setHeader('Content-Type', 'text/html');
        res.send(htmlResponse);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get debug slots info
app.get('/api/debug/slots', async (req, res) => {
    try {
        if (!fs.existsSync('teesheet.html')) {
            return res.status(404).json({ error: 'No teesheet.html file' });
        }

        const html = fs.readFileSync('teesheet.html', 'utf8');
        const slots = bookingService.parseAvailableSlots(html);

        res.json({
            success: true,
            slotsFound: slots.length,
            slots: slots,
            pageInfo: {
                hasLoginForm: html.includes('txtUsername'),
                hasLaunchReserver: html.includes('LaunchReserver'),
                hasAvailableClass: html.includes('NC_TimeSlotPanelSlotAvailable'),
                htmlLength: html.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: pool ? 'connected' : 'disconnected',
        weekendAutomation: weekendAutomation ? 'enabled' : 'disabled'
    });
});



// Add this new endpoint to server.js after the existing weekend endpoints (around line 250)

// Force refresh weekend status (useful after manual attempts)
app.post('/api/weekend-refresh', async (req, res) => {
    try {
        if (!weekendAutomation) {
            return res.status(500).json({ error: 'Weekend automation not initialized' });
        }

        console.log('🔄 Manually refreshing weekend status...');

        // Get updated status
        const weekends = await weekendAutomation.getUpcomingWeekends();

        // Return the updated weekends
        res.json({
            success: true,
            message: 'Weekend status refreshed',
            weekends: weekends
        });
    } catch (error) {
        console.error('Error refreshing weekend status:', error);
        res.status(500).json({ error: error.message });
    }
});


// Add manual attempt trigger for specific weekend
app.post('/api/weekend-attempt/:date', async (req, res) => {
    try {
        const { date } = req.params;

        if (!weekendAutomation) {
            return res.status(500).json({ error: 'Weekend automation not initialized' });
        }

        // Check if enabled
        const [settings] = await pool.query('SELECT is_enabled FROM weekend_auto_settings WHERE user_id = 1');
        if (!settings[0]?.is_enabled) {
            return res.status(400).json({ error: 'Weekend auto-booking is disabled' });
        }

        // Parse the date
        const targetDate = new Date(date + 'T12:00:00');
        const dayOfWeek = targetDate.getDay();

        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            return res.status(400).json({ error: 'Date must be a Saturday or Sunday' });
        }

        console.log(`⚡ Manual trigger for weekend booking: ${date}`);

        // Execute booking attempt
        const result = await weekendAutomation.executeWeekendBooking(targetDate, 'manual');

        if (result?.success) {
            res.json({
                success: true,
                message: `Successfully booked ${date} at ${result.slot?.time}`,
                slot: result.slot
            });
        } else {
            res.json({
                success: false,
                message: result?.message || 'Booking attempt failed',
                details: result
            });
        }
    } catch (error) {
        console.error('Manual weekend attempt error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ===============================
// CRON JOBS
// ===============================

// 1. EXISTING: Automated booking checker for manual bookings - runs every minute
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        console.log(`🔄 Cron check at ${now.toLocaleTimeString()}`);

        // Find ALL pending MANUAL bookings for dates that haven't passed yet
        const [pendingBookings] = await pool.query(
            `SELECT * FROM booking_preferences
             WHERE status = 'pending'
               AND booking_type = 'manual'
               AND date >= CURDATE()
               AND (last_attempt IS NULL OR last_attempt < DATE_SUB(NOW(), INTERVAL 5 MINUTE))`
        );

        console.log(`📊 Found ${pendingBookings.length} pending manual bookings to check`);

        if (pendingBookings.length > 0) {
            console.log(`⏰ Found ${pendingBookings.length} manual bookings to process`);

            const [userSettings] = await pool.query('SELECT * FROM user_settings WHERE id = 1');

            if (!userSettings[0]?.username) {
                console.log('⚠️  No credentials configured, skipping automated booking');
                return;
            }

            for (const booking of pendingBookings) {
                const opensAt = new Date(booking.booking_opens_at);
                const timeUntilOpen = opensAt - now;

                // If booking opens in less than 30 seconds, wait for optimal timing
                if (timeUntilOpen > 0 && timeUntilOpen < 30000) {
                    console.log(`⏳ Manual booking window opens in ${Math.round(timeUntilOpen / 1000)}s - waiting...`);
                    setTimeout(async () => {
                        console.log(`🎯 Attempting manual booking for ${booking.date}`);

                        await logBookingAttempt(booking.id, 'auto_attempt', 'info', 'Automated booking attempt started (optimal timing)');

                        const result = await processBooking(booking, userSettings[0]);

                        if (result.success) {
                            await pool.query(
                                'UPDATE booking_preferences SET status = ?, attempts = attempts + 1, last_attempt = NOW() WHERE id = ?',
                                ['booked', booking.id]
                            );

                            await logBookingAttempt(booking.id, 'auto_attempt', 'success',
                                `Successfully booked: ${result.slot?.time || 'Unknown time'}`, result);

                            console.log(`✅ Successfully booked ${booking.date} at ${result.slot?.time}`);
                        } else {
                            await pool.query(
                                'UPDATE booking_preferences SET attempts = attempts + 1, last_attempt = NOW() WHERE id = ?',
                                [booking.id]
                            );

                            await logBookingAttempt(booking.id, 'auto_attempt', 'failed',
                                result.message || result.error || 'Unknown error', result);

                            console.log(`❌ Failed to book ${booking.date}: ${result.message || result.error}`);
                        }
                    }, timeUntilOpen);
                } else {
                    // Either booking window is already open or far in future - check availability now
                    console.log(`🎯 Checking availability for manual booking ${booking.date}`);

                    await logBookingAttempt(booking.id, 'auto_attempt', 'info', 'Automated booking attempt started');

                    const result = await processBooking(booking, userSettings[0]);

                    if (result.success) {
                        await pool.query(
                            'UPDATE booking_preferences SET status = ?, attempts = attempts + 1, last_attempt = NOW() WHERE id = ?',
                            ['booked', booking.id]
                        );

                        await logBookingAttempt(booking.id, 'auto_attempt', 'success',
                            `Successfully booked: ${result.slot?.time || 'Unknown time'}`, result);

                        console.log(`✅ Successfully booked ${booking.date} at ${result.slot?.time}`);
                    } else {
                        await pool.query(
                            'UPDATE booking_preferences SET attempts = attempts + 1, last_attempt = NOW() WHERE id = ?',
                            [booking.id]
                        );

                        await logBookingAttempt(booking.id, 'auto_attempt', 'failed',
                            result.message || result.error || 'Unknown error', result);

                        console.log(`⏳ No slots available for ${booking.date}: ${result.message || result.error}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Manual booking cron error:', error);
    }
});

// 2. NEW: Weekend catch-up mode - runs every 30 minutes
cron.schedule('*/30 * * * *', async () => {
    try {
        if (!weekendAutomation) return;

        const now = new Date();
        console.log(`🔄 [${now.toLocaleTimeString()}] Running weekend catch-up check...`);

        await weekendAutomation.executeCatchUpBookings();
    } catch (error) {
        console.error('❌ Catch-up cron error:', error);
    }
});

// 3. Weekend pre-warm connection - runs at 6:29:30 AM EDT on weekends
cron.schedule('30 29 6 * * 0,6', async () => {
    try {
        if (!weekendAutomation) return;

        const now = weekendAutomation.getCurrentEDT();
        console.log(`🔥 [${now.toLocaleTimeString()}] Pre-warming for weekend booking...`);
        await weekendAutomation.preWarmConnection();
    } catch (error) {
        console.error('❌ Pre-warm error:', error);
    }
}, {
    timezone: "America/New_York"
});

// 4. Weekend real-time booking - runs at 6:30 AM EDT on weekends
cron.schedule('0-10 30 6 * * 0,6', async () => {
    try {
        if (!weekendAutomation) return;

        const now = weekendAutomation.getCurrentEDT();
        console.log(`🎯 [${now.toLocaleTimeString()}] WEEKEND REAL-TIME BOOKING WINDOW!`);
        await weekendAutomation.executeRealTimeBooking();
    } catch (error) {
        console.error('❌ Weekend real-time booking error:', error);
    }
}, {
    timezone: "America/New_York"
});

// Catch all handler - serve React app for any route not handled by API
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    await initDB();

    // Run initial catch-up check after 5 seconds if weekend booking is enabled
    setTimeout(async () => {
        if (weekendAutomation) {
            const [settings] = await pool.query('SELECT is_enabled FROM weekend_auto_settings WHERE user_id = 1');
            if (settings[0]?.is_enabled) {
                console.log('🚀 Running initial weekend catch-up check...');
                await weekendAutomation.executeCatchUpBookings();
            }
        }
    }, 5000);

    console.log(`
🚀 Golf Booking Server Started
📍 Port: ${PORT}
🌐 URL: http://localhost:${PORT}
⏰ Manual booking checker: Active (every minute)
⛳ Weekend auto-booking: Active (Sat/Sun at 6:30 AM EDT)
🔄 Weekend catch-up: Active (every 30 minutes)
📊 Max weekend bookings: 4
📅 Time: ${new Date().toLocaleString()}

Navigate to http://localhost:${PORT} to access the web interface.

Weekend Auto-Booking Features:
- Immediate catch-up when enabled (books already-open weekends)
- Every 30 minutes: Checks for bookable weekends
- Every Sat/Sun 6:30 AM EDT: Books exactly 7 days ahead
- Time Range: 7:50 AM - 1:00 PM (no expansion)
- Maximum: 4 weekends booked at once

Debug URLs:
- View Tee Sheet: http://localhost:${PORT}/api/view/teesheet
- Debug Slots: http://localhost:${PORT}/api/debug/slots
- Health Check: http://localhost:${PORT}/api/health
- Weekend History: http://localhost:${PORT}/api/weekend-history
  `);
});

// Graceful shutdown handling
let shutdownInProgress = false;

async function gracefulShutdown(signal) {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    
    try {
        if (server) {
            console.log('🔌 Closing HTTP server...');
            server.close(() => {
                console.log('✅ HTTP server closed');
            });
        }
        
        if (pool) {
            console.log('🗄️ Closing database connections...');
            await pool.end();
            console.log('✅ Database connections closed');
        }
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});