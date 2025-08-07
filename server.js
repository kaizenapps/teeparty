// server.js - Merged Frontend + Backend Service (ES Modules)
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the React build
app.use(express.static(path.join(__dirname, 'dist')));

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'golf_booking',
    timezone: '+00:00',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
const bookingService = new GolfBookingService();

// Initialize database connection
async function initDB() {
    try {
        pool = mysql.createPool(dbConfig);
        await pool.query('SELECT 1');
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
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

// Get user settings
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, username, created_at, updated_at FROM user_settings WHERE id = 1');
        res.json(rows[0] || { username: '' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update and verify credentials
app.post('/api/settings/credentials', async (req, res) => {
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

// Get all bookings
app.get('/api/bookings', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, user_id, DATE_FORMAT(date, '%c/%e/%Y') as date_formatted,
                    DATE_FORMAT(date, '%M %e, %Y') as date_long_format,
                 date as date_raw, preferred_time, max_time, status, attempts,
                 last_attempt, booking_opens_at, created_at
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
                last_attempt: row.last_attempt ? new Date(row.last_attempt).toLocaleString('en-US') : null
            };
        });

        res.json(formattedRows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new booking preference
app.post('/api/bookings', async (req, res) => {
    try {
        const { date, preferredTime, maxTime } = req.body;

        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        // Calculate when booking opens (1 week prior at 6:30 AM Eastern)
        const bookingDate = new Date(date + 'T12:00:00');
        const opensAt = new Date(bookingDate);
        opensAt.setDate(opensAt.getDate() - 7);
        opensAt.setHours(6, 30, 0, 0);

        // Check for duplicate
        const [existing] = await pool.query(
            'SELECT id FROM booking_preferences WHERE user_id = 1 AND date = ?',
            [date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Booking already exists for this date' });
        }

        const [result] = await pool.query(
            'INSERT INTO booking_preferences (user_id, date, preferred_time, max_time, booking_opens_at, status) VALUES (?, ?, ?, ?, ?, ?)',
            [1, date, preferredTime || '07:54:00', maxTime || '13:00:00', opensAt, 'pending']
        );

        await logBookingAttempt(result.insertId, 'created', 'info', `Booking scheduled for ${date}`);

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
app.delete('/api/bookings/:id', async (req, res) => {
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
app.get('/api/logs/:preferenceId', async (req, res) => {
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
app.post('/api/bookings/:id/trigger', async (req, res) => {
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

        const availableSlots = teeSheet.slots.filter(slot => {
            const slotMin = bookingService.timeToMinutes(slot.time);
            const inRange = slotMin >= preferredTimeMin && slotMin <= maxTimeMin;
            console.log(`Checking slot ${slot.time} (${slotMin} min): ${inRange ? 'YES' : 'NO'}`);
            return inRange && slot.availableSpots > 0;
        });

        console.log(`Found ${availableSlots.length} slots in preferred time range`);

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
        database: pool ? 'connected' : 'disconnected'
    });
});

// Automated booking checker - runs every minute
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        console.log(`🔄 Cron check at ${now.toLocaleTimeString()}`);

        // Find ALL pending bookings for dates that haven't passed yet
        const [pendingBookings] = await pool.query(
            `SELECT * FROM booking_preferences
             WHERE status = 'pending'
               AND date >= CURDATE()
               AND (last_attempt IS NULL OR last_attempt < DATE_SUB(NOW(), INTERVAL 5 MINUTE))`
        );

        console.log(`📊 Found ${pendingBookings.length} pending bookings to check for available slots`);

        if (pendingBookings.length > 0) {
            console.log(`⏰ Found ${pendingBookings.length} bookings to process`);

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
                    console.log(`⏳ Booking window opens in ${Math.round(timeUntilOpen / 1000)}s - waiting for optimal timing...`);
                    setTimeout(async () => {
                        console.log(`🎯 Attempting booking for ${booking.date} (optimal window)`);

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
                    console.log(`🎯 Checking availability for ${booking.date}`);

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
        console.error('❌ Cron job error:', error);
    }
});

// Catch all handler - serve React app for any route not handled by API
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    await initDB();
    console.log(`
🚀 Golf Booking Server Started
📍 Port: ${PORT}
🌐 URL: http://localhost:${PORT}
⏰ Automated booking checker: Active (runs every minute)
📅 Time: ${new Date().toLocaleString()}

Navigate to http://localhost:${PORT} to access the web interface.

Debug URLs:
- View Tee Sheet: http://localhost:${PORT}/api/view/teesheet
- Debug Slots: http://localhost:${PORT}/api/debug/slots
- Health Check: http://localhost:${PORT}/api/health
  `);
});