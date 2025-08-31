// weekendAutomation.js - Enhanced Weekend Auto-Booking Module with Catch-Up
import GolfBookingService from './bookingService.js';

class WeekendAutomation {
    constructor(pool) {
        this.pool = pool;
        this.bookingService = new GolfBookingService();
        this.timeZone = 'America/New_York'; // Always EDT/EST
        this.isBookingInProgress = false;
        this.bookingAttempts = new Map(); // Track attempts per date
        this.maxWeekendBookings = 4; // Maximum weekends to have booked
        this.catchUpInProgress = false;
    }

    // Get current time in EDT
    getCurrentEDT() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: this.timeZone }));
    }

    // Format date for database (YYYY-MM-DD)
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Get the target weekend date (7 days from today)
    getTargetWeekendDate() {
        const now = this.getCurrentEDT();
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 7);
        return targetDate;
    }

    // Check if booking window is open for a date
    isBookingWindowOpen(targetDate) {
        const now = this.getCurrentEDT();
        const bookingOpens = new Date(targetDate);
        bookingOpens.setDate(bookingOpens.getDate() - 7);
        bookingOpens.setHours(6, 30, 0, 0);

        return now >= bookingOpens;
    }

    // Check if current time is the optimal booking window (6:30 AM)
    isOptimalBookingTime() {
        const now = this.getCurrentEDT();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();

        // Between 6:29:50 and 6:30:30
        const currentTimeInSeconds = hours * 3600 + minutes * 60 + seconds;
        const startWindow = 6 * 3600 + 29 * 60 + 50;
        const endWindow = 6 * 3600 + 30 * 60 + 30;

        return currentTimeInSeconds >= startWindow && currentTimeInSeconds <= endWindow;
    }

    // Check if weekend auto-booking is enabled
    async isEnabled() {
        try {
            const [settings] = await this.pool.query(
                'SELECT is_enabled FROM weekend_auto_settings WHERE user_id = 1'
            );
            return settings.length > 0 && settings[0].is_enabled;
        } catch (error) {
            console.error('Error checking weekend settings:', error);
            return false;
        }
    }

    // Get count of currently booked weekends
    async getBookedWeekendCount() {
        try {
            const [result] = await this.pool.query(
                `SELECT COUNT(*) as count 
                 FROM booking_preferences 
                 WHERE user_id = 1 
                 AND date >= CURDATE() 
                 AND DAYOFWEEK(date) IN (1, 7)
                 AND status IN ('booked', 'pending')`
            );
            return result[0].count || 0;
        } catch (error) {
            console.error('Error counting booked weekends:', error);
            return 0;
        }
    }

    // Check if we already attempted this weekend and failed
    async hasFailedAttempt(targetDate) {
        try {
            const dateStr = this.formatDate(targetDate);
            const [history] = await this.pool.query(
                `SELECT status FROM weekend_booking_history 
                 WHERE target_date = ? 
                 AND status = 'no_slots'
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [dateStr]
            );
            return history.length > 0;
        } catch (error) {
            console.error('Error checking failed attempts:', error);
            return false;
        }
    }

    // Check if we already have a booking for this date
    async hasExistingBooking(targetDate) {
        try {
            const dateStr = this.formatDate(targetDate);
            const [existing] = await this.pool.query(
                'SELECT id, booking_type, status FROM booking_preferences WHERE date = ? AND user_id = 1',
                [dateStr]
            );

            if (existing.length > 0) {
                console.log(`📅 Existing booking found for ${dateStr}: Type=${existing[0].booking_type}, Status=${existing[0].status}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error checking existing booking:', error);
            return true; // Err on the side of caution
        }
    }

    // Pre-warm the connection before booking window
    async preWarmConnection() {
        try {
            console.log('🔥 Pre-warming connection for weekend booking...');

            const [userSettings] = await this.pool.query('SELECT * FROM user_settings WHERE id = 1');

            if (!userSettings[0]?.username) {
                console.log('⚠️ No credentials configured');
                return false;
            }

            const username = userSettings[0].username;
            const password = Buffer.from(userSettings[0].password_encrypted, 'base64').toString();

            const authResult = await this.bookingService.authenticate(username, password);

            if (authResult.success) {
                console.log('✅ Connection pre-warmed successfully');
                return true;
            } else {
                console.log('❌ Pre-warm authentication failed');
                return false;
            }
        } catch (error) {
            console.error('Pre-warm error:', error);
            return false;
        }
    }

    // Log weekend booking attempt
    async logWeekendAttempt(targetDate, status, message, bookedTime = null) {
        try {
            const dayName = targetDate.getDay() === 6 ? 'Saturday' : 'Sunday';

            await this.pool.query(
                `INSERT INTO weekend_booking_history 
                (target_date, day_of_week, booking_opened_at, attempt_started_at, 
                 attempt_ended_at, status, booked_time, attempts, error_message) 
                VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
                [
                    this.formatDate(targetDate),
                    dayName,
                    new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000),
                    new Date(),
                    status,
                    bookedTime,
                    this.bookingAttempts.get(this.formatDate(targetDate)) || 1,
                    message
                ]
            );
        } catch (error) {
            console.error('Error logging weekend attempt:', error);
        }
    }

    // Execute booking for a specific weekend
    async executeWeekendBooking(targetDate, mode = 'real-time') {
        if (this.isBookingInProgress) {
            console.log('⏳ Booking already in progress, skipping...');
            return null;
        }

        try {
            this.isBookingInProgress = true;

            const targetDateStr = this.formatDate(targetDate);
            const targetDayName = targetDate.getDay() === 6 ? 'Saturday' : 'Sunday';

            console.log(`🎯 [${mode}] Attempting to book ${targetDayName} ${targetDateStr}`);

            // Check if already booked
            if (await this.hasExistingBooking(targetDate)) {
                console.log(`✓ ${targetDayName} ${targetDateStr} already has a booking`);
                await this.logWeekendAttempt(targetDate, 'already_booked', 'Booking already exists');
                return null;
            }

            // Check if we already tried and found no slots
            if (mode === 'catch-up' && await this.hasFailedAttempt(targetDate)) {
                console.log(`⏭️ ${targetDayName} ${targetDateStr} already attempted (no slots), skipping`);
                return null;
            }

            // Get user credentials
            const [userSettings] = await this.pool.query('SELECT * FROM user_settings WHERE id = 1');

            if (!userSettings[0]?.username) {
                console.log('❌ No credentials configured');
                await this.logWeekendAttempt(targetDate, 'failed', 'No credentials configured');
                return null;
            }

            // Authenticate if needed
            if (!this.bookingService.sessionToken) {
                const username = userSettings[0].username;
                const password = Buffer.from(userSettings[0].password_encrypted, 'base64').toString();

                const authResult = await this.bookingService.authenticate(username, password);

                if (!authResult.success) {
                    console.log('❌ Authentication failed');
                    await this.logWeekendAttempt(targetDate, 'failed', 'Authentication failed');
                    return null;
                }
            }

            // Get guests
            const [guests] = await this.pool.query('SELECT * FROM guest_list WHERE is_active = 1 LIMIT 3');

            if (guests.length < 3) {
                console.log('❌ Not enough guests configured');
                await this.logWeekendAttempt(targetDate, 'failed', 'Not enough guests');
                return null;
            }

            console.log(`⛳ Attempting to book ${targetDayName} ${targetDateStr} between 7:50 AM - 2:30 PM`);

            // Try to book with fixed weekend time range
            const result = await this.bookingService.findAndBookBestSlot(
                targetDate,
                '07:50:00',
                '14:30:00',
                guests,
                true  // ⚡ FAST MODE ENABLED FOR WEEKEND BOOKING
            );

            if (result.success) {
                console.log(`✅ Successfully booked ${targetDayName} ${targetDateStr} at ${result.slot?.time || 'unknown time'}`);

                // Save to database
                const opensAt = new Date(targetDate);
                opensAt.setDate(opensAt.getDate() - 7);
                opensAt.setHours(6, 30, 0, 0);

                await this.pool.query(
                    `INSERT INTO booking_preferences 
                    (user_id, date, preferred_time, max_time, booking_opens_at, status, booking_type, attempts, last_attempt) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        1,
                        targetDateStr,
                        '07:50:00',
                        '14:30:00',
                        opensAt,
                        'booked',
                        'weekend_auto',
                        1
                    ]
                );

                // Update weekend settings
                const updateField = targetDate.getDay() === 6 ? 'last_saturday_booked' : 'last_sunday_booked';
                await this.pool.query(
                    `UPDATE weekend_auto_settings SET ${updateField} = ? WHERE user_id = 1`,
                    [targetDateStr]
                );

                await this.logWeekendAttempt(targetDate, 'success', 'Booking successful', result.slot?.time);

                return result;
            } else {
                const errorMsg = result.message || result.error || 'Unknown error';
                console.log(`❌ Failed to book ${targetDayName}: ${errorMsg}`);

                if (errorMsg.includes('No available slots')) {
                    console.log('😞 No slots available in preferred time range (7:50 AM - 2:30 PM)');
                    await this.logWeekendAttempt(targetDate, 'no_slots', 'No slots in 7:50 AM - 2:30 PM range');
                } else if (errorMsg.includes('not open') || errorMsg.includes('countdown')) {
                    console.log('⏰ Slots not open yet');
                    await this.logWeekendAttempt(targetDate, 'failed', 'Booking window not open yet');
                } else {
                    await this.logWeekendAttempt(targetDate, 'failed', errorMsg);
                }

                return null;
            }
        } catch (error) {
            console.error('❌ Weekend booking error:', error);
            return null;
        } finally {
            this.isBookingInProgress = false;
        }
    }

    // Catch-up mode: Book any available weekends that are already open
    async executeCatchUpBookings() {
        if (this.catchUpInProgress) {
            console.log('⏳ Catch-up already in progress, skipping...');
            return;
        }

        try {
            this.catchUpInProgress = true;

            // Check if enabled
            if (!await this.isEnabled()) {
                console.log('🚫 Weekend auto-booking is disabled');
                return;
            }

            console.log('🔄 Starting weekend catch-up check...');

            // Check how many weekends we already have booked
            const bookedCount = await this.getBookedWeekendCount();
            if (bookedCount >= this.maxWeekendBookings) {
                console.log(`📊 Already have ${bookedCount}/${this.maxWeekendBookings} weekends booked, skipping catch-up`);
                return;
            }

            // Get next 6 weekends
            const weekends = await this.getNext6Weekends();
            let bookingsMade = 0;
            const availableSlots = this.maxWeekendBookings - bookedCount;

            for (const weekend of weekends) {
                if (bookingsMade >= availableSlots) {
                    console.log(`📊 Reached booking limit (${this.maxWeekendBookings} weekends)`);
                    break;
                }

                // Check Saturday
                if (this.isBookingWindowOpen(weekend.saturday.dateObj) && !weekend.saturday.isBooked) {
                    if (!await this.hasFailedAttempt(weekend.saturday.dateObj)) {
                        console.log(`📅 Catch-up: Booking window open for Saturday ${weekend.saturday.date}`);
                        const result = await this.executeWeekendBooking(weekend.saturday.dateObj, 'catch-up');
                        if (result?.success) bookingsMade++;

                        // Small delay between bookings
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }

                if (bookingsMade >= availableSlots) break;

                // Check Sunday
                if (this.isBookingWindowOpen(weekend.sunday.dateObj) && !weekend.sunday.isBooked) {
                    if (!await this.hasFailedAttempt(weekend.sunday.dateObj)) {
                        console.log(`📅 Catch-up: Booking window open for Sunday ${weekend.sunday.date}`);
                        const result = await this.executeWeekendBooking(weekend.sunday.dateObj, 'catch-up');
                        if (result?.success) bookingsMade++;

                        // Small delay between bookings
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }

            if (bookingsMade > 0) {
                console.log(`✅ Catch-up complete: ${bookingsMade} weekend(s) booked`);
            } else {
                console.log('📊 Catch-up complete: No new bookings made');
            }
        } catch (error) {
            console.error('❌ Catch-up error:', error);
        } finally {
            this.catchUpInProgress = false;
        }
    }

    // Real-time booking: Book exactly when window opens
    async executeRealTimeBooking() {
        const now = this.getCurrentEDT();
        const dayOfWeek = now.getDay();

        // Only run on Saturday (6) or Sunday (0)
        if (dayOfWeek !== 6 && dayOfWeek !== 0) {
            return;
        }

        // Check if enabled
        if (!await this.isEnabled()) {
            console.log('🚫 Weekend auto-booking is disabled');
            return;
        }

        // Check booking limit
        const bookedCount = await this.getBookedWeekendCount();
        if (bookedCount >= this.maxWeekendBookings) {
            console.log(`📊 Already have ${bookedCount}/${this.maxWeekendBookings} weekends booked`);
            return;
        }

        // Get target date (7 days ahead)
        const targetDate = this.getTargetWeekendDate();

        console.log('🎯 Real-time weekend booking window detected');
        await this.executeWeekendBooking(targetDate, 'real-time');
    }

    // Get next 6 weekends with their booking status
    async getNext6Weekends() {
        const weekends = [];
        const now = this.getCurrentEDT();

        // Calculate next 6 weekends
        for (let i = 0; i < 6; i++) {
            // Calculate days until next Saturday
            const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;

            const saturday = new Date(now);
            saturday.setDate(saturday.getDate() + daysUntilSaturday + (i * 7));
            saturday.setHours(12, 0, 0, 0);

            const sunday = new Date(saturday);
            sunday.setDate(sunday.getDate() + 1);

            // Check if bookings exist
            const [satBooking] = await this.pool.query(
                'SELECT status, booking_type FROM booking_preferences WHERE date = ?',
                [this.formatDate(saturday)]
            );

            const [sunBooking] = await this.pool.query(
                'SELECT status, booking_type FROM booking_preferences WHERE date = ?',
                [this.formatDate(sunday)]
            );

            // Calculate when bookings open
            const saturdayOpens = new Date(saturday);
            saturdayOpens.setDate(saturdayOpens.getDate() - 7);
            saturdayOpens.setHours(6, 30, 0, 0);

            const sundayOpens = new Date(sunday);
            sundayOpens.setDate(sundayOpens.getDate() - 7);
            sundayOpens.setHours(6, 30, 0, 0);

            weekends.push({
                saturday: {
                    date: this.formatDate(saturday),
                    dateObj: saturday,
                    opensAt: saturdayOpens,
                    isBooked: satBooking.length > 0,
                    status: satBooking[0]?.status || null,
                    type: satBooking[0]?.booking_type || null,
                    bookingOpen: this.isBookingWindowOpen(saturday)
                },
                sunday: {
                    date: this.formatDate(sunday),
                    dateObj: sunday,
                    opensAt: sundayOpens,
                    isBooked: sunBooking.length > 0,
                    status: sunBooking[0]?.status || null,
                    type: sunBooking[0]?.booking_type || null,
                    bookingOpen: this.isBookingWindowOpen(sunday)
                }
            });
        }

        return weekends;
    }

    // Get upcoming weekends for UI display
    async getUpcomingWeekends() {
        const weekends = [];
        const now = this.getCurrentEDT();

        // Calculate next 4 weekends (for UI display)
        for (let i = 0; i < 4; i++) {
            // Calculate days until next Saturday
            const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;

            const saturday = new Date(now);
            saturday.setDate(saturday.getDate() + daysUntilSaturday + (i * 7));
            saturday.setHours(12, 0, 0, 0);

            const sunday = new Date(saturday);
            sunday.setDate(sunday.getDate() + 1);

            // Check if bookings exist
            const [satBooking] = await this.pool.query(
                'SELECT status, booking_type FROM booking_preferences WHERE date = ?',
                [this.formatDate(saturday)]
            );

            const [sunBooking] = await this.pool.query(
                'SELECT status, booking_type FROM booking_preferences WHERE date = ?',
                [this.formatDate(sunday)]
            );

            // Get latest attempt status from weekend_booking_history
            const [satHistory] = await this.pool.query(
                `SELECT status, booked_time, created_at 
                 FROM weekend_booking_history 
                 WHERE target_date = ? 
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [this.formatDate(saturday)]
            );

            const [sunHistory] = await this.pool.query(
                `SELECT status, booked_time, created_at 
                 FROM weekend_booking_history 
                 WHERE target_date = ? 
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [this.formatDate(sunday)]
            );

            // Calculate when bookings open
            const saturdayOpens = new Date(saturday);
            saturdayOpens.setDate(saturdayOpens.getDate() - 7);
            saturdayOpens.setHours(6, 30, 0, 0);

            const sundayOpens = new Date(sunday);
            sundayOpens.setDate(sundayOpens.getDate() - 7);
            sundayOpens.setHours(6, 30, 0, 0);

            // Determine actual status based on database
            const getSaturdayStatus = () => {
                // If there's a booking, show its status
                if (satBooking.length > 0) {
                    return {
                        status: 'booked',
                        type: satBooking[0].booking_type,
                        message: satBooking[0].booking_type === 'weekend_auto' ? 'Auto-Booked' : 'Manually Booked'
                    };
                }

                // Check history for attempt results
                if (satHistory.length > 0) {
                    const historyStatus = satHistory[0].status;
                    if (historyStatus === 'no_slots') {
                        return {
                            status: 'no_slots',
                            type: 'weekend_auto',
                            message: 'No slots in preferred time range'
                        };
                    } else if (historyStatus === 'failed') {
                        return {
                            status: 'failed',
                            type: 'weekend_auto',
                            message: 'Booking failed - may retry'
                        };
                    } else if (historyStatus === 'success') {
                        return {
                            status: 'booked',
                            type: 'weekend_auto',
                            message: 'Auto-Booked',
                            bookedTime: satHistory[0].booked_time
                        };
                    }
                }

                // No attempts yet - check if window is open
                const bookingOpen = this.isBookingWindowOpen(saturday);
                if (bookingOpen) {
                    return {
                        status: 'open',
                        type: null,
                        message: 'Booking window open'
                    };
                } else {
                    return {
                        status: 'scheduled',
                        type: null,
                        message: 'Will book when window opens'
                    };
                }
            };

            const getSundayStatus = () => {
                // If there's a booking, show its status
                if (sunBooking.length > 0) {
                    return {
                        status: 'booked',
                        type: sunBooking[0].booking_type,
                        message: sunBooking[0].booking_type === 'weekend_auto' ? 'Auto-Booked' : 'Manually Booked'
                    };
                }

                // Check history for attempt results
                if (sunHistory.length > 0) {
                    const historyStatus = sunHistory[0].status;
                    if (historyStatus === 'no_slots') {
                        return {
                            status: 'no_slots',
                            type: 'weekend_auto',
                            message: 'No slots in preferred time range'
                        };
                    } else if (historyStatus === 'failed') {
                        return {
                            status: 'failed',
                            type: 'weekend_auto',
                            message: 'Booking failed - may retry'
                        };
                    } else if (historyStatus === 'success') {
                        return {
                            status: 'booked',
                            type: 'weekend_auto',
                            message: 'Auto-Booked',
                            bookedTime: sunHistory[0].booked_time
                        };
                    }
                }

                // No attempts yet - check if window is open
                const bookingOpen = this.isBookingWindowOpen(sunday);
                if (bookingOpen) {
                    return {
                        status: 'open',
                        type: null,
                        message: 'Booking window open'
                    };
                } else {
                    return {
                        status: 'scheduled',
                        type: null,
                        message: 'Will book when window opens'
                    };
                }
            };

            const satStatus = getSaturdayStatus();
            const sunStatus = getSundayStatus();

            weekends.push({
                saturday: {
                    date: this.formatDate(saturday),
                    dateObj: saturday,
                    opensAt: saturdayOpens,
                    isBooked: satBooking.length > 0,
                    bookingOpen: this.isBookingWindowOpen(saturday),
                    actualStatus: satStatus.status,
                    statusMessage: satStatus.message,
                    type: satStatus.type,
                    bookedTime: satStatus.bookedTime || null,
                    hasHistory: satHistory.length > 0
                },
                sunday: {
                    date: this.formatDate(sunday),
                    dateObj: sunday,
                    opensAt: sundayOpens,
                    isBooked: sunBooking.length > 0,
                    bookingOpen: this.isBookingWindowOpen(sunday),
                    actualStatus: sunStatus.status,
                    statusMessage: sunStatus.message,
                    type: sunStatus.type,
                    bookedTime: sunStatus.bookedTime || null,
                    hasHistory: sunHistory.length > 0
                }
            });
        }

        return weekends;
    }

}

export default WeekendAutomation;