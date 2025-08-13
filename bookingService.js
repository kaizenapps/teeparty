// bookingService.js - ES Module Version
import axios from 'axios';
import * as cheerio from 'cheerio';
import tough from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs';

class GolfBookingService {
    constructor() {
        this.baseURL = 'https://www.trumpcoltsneck.com';
        this.siteURL = 'https://www.trumpcoltsneck.com/sites/TrumpNationalGolfClub2016ColtsNeck';
        this.courseId = '95';
        this.sessionToken = '';

        // Create a cookie jar to maintain session
        this.cookieJar = new tough.CookieJar();
        this.client = wrapper(axios.create({
            jar: this.cookieJar,
            withCredentials: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }));
    }

    // RC4 encryption matching the site's implementation
    rc4(key, str) {
        const s = [];
        for (let i = 0; i < 256; i++) {
            s[i] = i;
        }

        let j = 0;
        for (let i = 0; i < 256; i++) {
            j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
            [s[i], s[j]] = [s[j], s[i]];
        }

        let i = 0;
        j = 0;
        let result = '';

        for (let y = 0; y < str.length; y++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            [s[i], s[j]] = [s[j], s[i]];
            result += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
        }

        return result;
    }

    hexEncode(str) {
        return Buffer.from(str, 'binary').toString('hex');
    }

    hexDecode(hex) {
        return Buffer.from(hex, 'hex').toString('binary');
    }

    // Authenticate with the golf site
    async authenticate(username, password) {
        try {
            console.log('Starting authentication for:', username);

            // Step 1: Get encryption key
            const step1Response = await this.client.post(
                `${this.baseURL}/a_master/net/net_advancedlogin/login.asmx/loginStep1`,
                JSON.stringify({ lstep: 1 }),
                {
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    params: { r: Math.floor(Math.random() * 1000) }
                }
            );

            const keyData = JSON.parse(step1Response.data.d)[0];
            const encKey = decodeURIComponent(keyData.key);
            const cip = keyData.cip || '';

            console.log('Got encryption key');

            // Step 2: Send encrypted credentials
            const encryptedId = this.hexEncode(this.rc4(encKey, username));
            const encryptedPw = this.hexEncode(this.rc4(encKey, password));
            const encryptedCip = cip ? this.hexEncode(this.rc4(encKey, cip)) : '';

            const step2Response = await this.client.post(
                `${this.baseURL}/a_master/net/net_advancedlogin/login.asmx/loginStep2`,
                JSON.stringify({
                    id: encodeURIComponent(encryptedId),
                    pw: encodeURIComponent(encryptedPw),
                    url: '',
                    cip: encodeURIComponent(encryptedCip)
                }),
                {
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    params: { r: Math.floor(Math.random() * 1000) }
                }
            );

            const tokenData = JSON.parse(step2Response.data.d)[0];
            this.sessionToken = tokenData.token;

            console.log('Got session token');

            // Step 3: Establish session at main URL
            const sessionResponse = await this.client.get(
                `${this.baseURL}/default.aspx`,
                {
                    params: {
                        login: 'true',
                        sessionToken: this.sessionToken,
                        gotopage: 'p=MembersDefault'
                    },
                    maxRedirects: 5
                }
            );

            // Also establish session at site URL
            console.log('Establishing session at site URL...');
            const siteSessionResponse = await this.client.get(
                `${this.siteURL}/Default.aspx`,
                {
                    params: {
                        p: 'MembersDefault'
                    }
                }
            );

            // Check if login was successful
            if (!siteSessionResponse.data.includes('txtUsername') &&
                !siteSessionResponse.data.includes('Login')) {
                console.log('Authentication successful');

                const cookies = await this.cookieJar.getCookies(this.siteURL);
                console.log(`Stored ${cookies.length} cookies`);

                return {
                    success: true,
                    token: this.sessionToken
                };
            } else {
                throw new Error('Login failed - still showing login page');
            }
        } catch (error) {
            console.error('Authentication error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Get tee sheet for a specific date
    async getTeeSheet(date) {
        try {
            // Ensure date is valid
            if (typeof date === 'string') {
                if (date.includes('GMT')) {
                    date = new Date(date);
                } else if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    date = new Date(date + 'T12:00:00');
                } else {
                    date = new Date(date);
                }
            }

            if (isNaN(date.getTime())) {
                throw new Error(`Invalid date: ${date}`);
            }

            const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
            console.log(`Fetching tee sheet for: ${formattedDate}`);

            // Step 1: Load the initial booking page to get the form data
            const initialResponse = await this.client.get(
                `${this.siteURL}/Default.aspx`,
                {
                    params: {
                        p: 'dynamicmodule',
                        pageid: '100076',
                        ssid: '100088',
                        vnf: '1'
                    }
                }
            );

            console.log('Initial page loaded, now updating date to:', formattedDate);

            // Step 2: Make a request with the specific date parameter
            const response = await this.client.get(
                `${this.siteURL}/Default.aspx`,
                {
                    params: {
                        p: 'dynamicmodule',
                        pageid: '100076',
                        ssid: '100088',
                        vnf: '1',
                        Date: formattedDate
                    }
                }
            );

            console.log('Response received, length:', response.data.length);

            // Debug: Save response
            fs.writeFileSync('teesheet.html', response.data);
            console.log('Saved response to teesheet.html');

            // Check if we got the right page
            if (response.data.includes('txtUsername') || response.data.includes('Login')) {
                throw new Error('Session expired - got login page');
            }

            if (response.data.includes('LaunchReserver')) {
                console.log('✅ Got tee sheet page with slots!');
            }

            return this.parseTeeSheet(response.data);
        } catch (error) {
            console.error('Error fetching tee sheet:', error.message);
            throw error;
        }
    }

    // Parse the tee sheet HTML
    parseTeeSheet(html) {
        const $ = cheerio.load(html);

        // Check if bookings are not open yet
        const notOpenText = $('.ncDateNotOpen').text();
        if (notOpenText) {
            const countdownText = $('#cdownBox').text();
            console.log('Bookings not open yet:', notOpenText);
            return {
                available: false,
                message: notOpenText,
                countdown: countdownText,
                slots: []
            };
        }

        // Parse available slots
        const slots = this.parseAvailableSlots(html);

        console.log(`Found ${slots.length} available slots`);

        return {
            available: true,
            totalSlots: slots.length,
            slots: slots
        };
    }

    // Parse available slots from HTML
    parseAvailableSlots(html) {
        const slots = [];
        const $ = cheerio.load(html);

        console.log('Parsing for available slots...');

        // Decode HTML entities if present
        const decodedHtml = html
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        // Method 1: Direct regex search (most reliable)
        const patterns = [
            /LaunchReserver\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/g,
            /LaunchReserver\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/g
        ];

        for (const pattern of patterns) {
            let match;
            pattern.lastIndex = 0;

            while ((match = pattern.exec(decodedHtml)) !== null) {
                const [fullMatch, courseId, date, time, tee, currentPlayers, availableSpots] = match;

                if (parseInt(availableSpots) > 0) {
                    const exists = slots.some(s => s.time === time && s.date === date);

                    if (!exists) {
                        slots.push({
                            time: time,
                            tee: tee === '1' ? '1st TEE' : '10th TEE',
                            availableSpots: parseInt(availableSpots),
                            currentPlayers: parseInt(currentPlayers),
                            courseId: courseId,
                            date: date,
                            canReserve: true
                        });

                        console.log(`Found slot: ${time} with ${availableSpots} spots`);
                    }
                }
            }
        }

        // Method 2: Look for onclick attributes with cheerio
        if (slots.length === 0) {
            console.log('Trying cheerio parsing...');

            $('[onclick]').each((i, elem) => {
                const onclick = $(elem).attr('onclick') || '';

                if (onclick.includes('LaunchReserver')) {
                    const match = onclick.match(/LaunchReserver\([^)]+\)/);
                    if (match) {
                        const params = match[0].match(/['"]([^'"]+)['"]/g);
                        if (params && params.length >= 6) {
                            const courseId = params[0].replace(/['"]/g, '');
                            const date = params[1].replace(/['"]/g, '');
                            const time = params[2].replace(/['"]/g, '');
                            const tee = params[3].replace(/['"]/g, '');
                            const currentPlayers = params[4].replace(/['"]/g, '');
                            const availableSpots = params[5].replace(/['"]/g, '');

                            if (parseInt(availableSpots) > 0) {
                                const exists = slots.some(s => s.time === time && s.date === date);
                                if (!exists) {
                                    slots.push({
                                        time: time,
                                        tee: tee === '1' ? '1st TEE' : '10th TEE',
                                        availableSpots: parseInt(availableSpots),
                                        currentPlayers: parseInt(currentPlayers),
                                        courseId: courseId,
                                        date: date,
                                        canReserve: true
                                    });
                                }
                            }
                        }
                    }
                }
            });
        }

        console.log(`Total slots found: ${slots.length}`);
        return slots;
    }

    // Convert time string to minutes for comparison
    timeToMinutes(timeStr) {
        try {
            timeStr = timeStr.toString().trim();

            // Handle HH:MM:SS format (24-hour)
            if (timeStr.match(/^\d{1,2}:\d{2}:\d{2}$/)) {
                const parts = timeStr.split(':');
                const hours = parseInt(parts[0]);
                const minutes = parseInt(parts[1]);
                const result = hours * 60 + minutes;
                console.log(`Converted ${timeStr} to ${result} minutes`);
                return result;
            }

            // Handle HH:MM format (24-hour)
            if (timeStr.match(/^\d{1,2}:\d{2}$/) && !timeStr.includes('AM') && !timeStr.includes('PM')) {
                const parts = timeStr.split(':');
                const hours = parseInt(parts[0]);
                const minutes = parseInt(parts[1]);
                const result = hours * 60 + minutes;
                console.log(`Converted ${timeStr} to ${result} minutes`);
                return result;
            }

            // Handle 12-hour format (H:MM AM/PM)
            const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (match) {
                let hours = parseInt(match[1]);
                const minutes = parseInt(match[2]);
                const period = match[3].toUpperCase();

                if (period === 'PM' && hours !== 12) {
                    hours += 12;
                } else if (period === 'AM' && hours === 12) {
                    hours = 0;
                }

                const result = hours * 60 + minutes;
                console.log(`Converted ${timeStr} to ${result} minutes`);
                return result;
            }

            console.error(`Could not parse time: "${timeStr}"`);
            return 0;
        } catch (error) {
            console.error(`Error parsing time "${timeStr}":`, error);
            return 0;
        }
    }

    // Make a reservation for a specific slot
    async makeReservation(slot, guests, mainPlayerName = 'Habib, Jake') {
        try {
            console.log(`Making reservation for ${slot.time} on ${slot.date}`);

            // First, get the booking form to extract required form fields
            const bookingFormResponse = await this.client.get(
                `${this.baseURL}/dialog.aspx`,
                {
                    params: {
                        p: 'NetcaddyPop',
                        tt: 'MakeTeeTime',
                        NoModResize: '1',
                        NoNav: '1',
                        ShowFooter: 'False',
                        courseid: slot.courseId,
                        date: slot.date,
                        time: slot.time,
                        hole: slot.tee === '1st TEE' ? '1' : '10',
                        numholes: '0',
                        xsome: '4',
                        startletter: ''
                    },
                    headers: {
                        'Referer': `${this.siteURL}/Default.aspx?p=dynamicmodule&pageid=100076&ssid=100088&vnf=1`
                    }
                }
            );

            console.log('Got booking form, extracting form data...');
            const $ = cheerio.load(bookingFormResponse.data);

            // Extract required form fields
            const viewState = $('input[name="__VIEWSTATE"]').val() || '';
            const eventValidation = $('input[name="__EVENTVALIDATION"]').val() || '';
            const ceViewState = $('input[name="__CEVIEWSTATE"]').val() || '';

            // Build form data for booking
            const formData = new URLSearchParams();

            // Core form fields - matching the exact structure from your sample
            formData.append('defaultSM', 'defaultSM|ctl00$ctrl_MakeTeeTime$lbBook');
            formData.append('rsmDefaultCSS_TSSM', 'Telerik.Web.UI, Version=2025.1.416.462, Culture=neutral, PublicKeyToken=121fae78165ba3d4:en-US:ced1f735-5c2a-4218-bd68-1813924fe936:1c2121e:e24b8e95:8cee9284:a3b7d93f:aac1aeb7:c73cf106;Telerik.Web.UI.Skins, Version=2025.1.416.462, Culture=neutral, PublicKeyToken=121fae78165ba3d4:en-US:ed16527b-31a8-4623-a686-9663f4c1871e:cb23ecce');
            formData.append('__EVENTTARGET', 'ctl00$ctrl_MakeTeeTime$lbBook');
            formData.append('__EVENTARGUMENT', '');
            formData.append('__CEVIEWSTATE', ceViewState);
            formData.append('__VIEWSTATE', viewState);
            if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);

            // Booking details with proper client states
            formData.append('ctl00$ctrl_MakeTeeTime$drpStartHole$tCombo', '1st Tee');
            formData.append('ctl00_ctrl_MakeTeeTime_drpStartHole_tCombo_ClientState', '{"logEntries":null,"value":"1","text":"1st Tee","enabled":false,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$drpStartHole$mobileComboSelected', '');

            formData.append('ctl00$ctrl_MakeTeeTime$drpRoundLength$tCombo', 'Eighteen Holes');
            formData.append('ctl00_ctrl_MakeTeeTime_drpRoundLength_tCombo_ClientState', '');

            formData.append('ctl00$ctrl_MakeTeeTime$drpPartySize$tCombo', 'Foursome');
            formData.append('ctl00_ctrl_MakeTeeTime_drpPartySize_tCombo_ClientState', '');

            formData.append('ctl00$ctrl_MakeTeeTime$rdDate$tMDateBox', slot.date);
            formData.append('ctl00$ctrl_MakeTeeTime$rdDate$mobileDateBoxSelected', '');

            formData.append('ctl00$ctrl_MakeTeeTime$drpCourseName$tCombo', 'Trump National Colts Neck');
            formData.append('ctl00_ctrl_MakeTeeTime_drpCourseName_tCombo_ClientState', '');

            formData.append('ctl00$ctrl_MakeTeeTime$drpTime$tCombo', slot.time);
            formData.append('ctl00_ctrl_MakeTeeTime_drpTime_tCombo_ClientState', '');
            formData.append('ctl00$ctrl_MakeTeeTime$drpTime$mobileComboSelected', '');

            // Add specific players matching your working request exactly
            // Player 1 (Member - Jake Habib)
            formData.append('ctl00$ctrl_MakeTeeTime$P1$chkNotify', 'on');
            formData.append('ctl00$ctrl_MakeTeeTime$P1$PCombo$PlayerName', 'Habib, Jake');
            formData.append('ctl00_ctrl_MakeTeeTime_P1_PCombo_PlayerName_ClientState',
                '{"logEntries":[],"value":"100003855_Member","text":"Habib, Jake","enabled":true,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$P1$transport$oCombo', 'Riding without Caddie');
            formData.append('ctl00_ctrl_MakeTeeTime_P1_transport_oCombo_ClientState',
                '{"logEntries":[],"value":"209","text":"Riding without Caddie","enabled":true,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$P1$transport$mobileComboSelected', '');
            formData.append('ctl00$ctrl_MakeTeeTime$P1$groupNum', '0');

            // Player 2 (Guest - Diana Bajramovic)
            formData.append('ctl00$ctrl_MakeTeeTime$P2$chkNotify', 'on');
            formData.append('ctl00$ctrl_MakeTeeTime$P2$PCombo$PlayerName', 'Bajramovic,  Diana');
            formData.append('ctl00_ctrl_MakeTeeTime_P2_PCombo_PlayerName_ClientState',
                '{"logEntries":[],"value":"1036745_Guest","text":"Bajramovic,  Diana","enabled":true,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$P2$transport$oCombo', 'Riding with Caddie');
            formData.append('ctl00_ctrl_MakeTeeTime_P2_transport_oCombo_ClientState',
                '{"logEntries":[],"value":"205","text":"Riding with Caddie","enabled":true,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$P2$transport$mobileComboSelected', '');
            formData.append('ctl00$ctrl_MakeTeeTime$P2$groupNum', '0');

            // Player 3 (Guest - Louie Belpedio)
            formData.append('ctl00$ctrl_MakeTeeTime$P3$chkNotify', 'on');
            formData.append('ctl00$ctrl_MakeTeeTime$P3$PCombo$PlayerName', 'belpedio,  louie');
            formData.append('ctl00_ctrl_MakeTeeTime_P3_PCombo_PlayerName_ClientState',
                '{"logEntries":[],"value":"1051175_Guest","text":"belpedio,  louie","enabled":true,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$P3$transport$oCombo', 'Riding with Caddie');
            formData.append('ctl00_ctrl_MakeTeeTime_P3_transport_oCombo_ClientState',
                '{"logEntries":[],"value":"205","text":"Riding with Caddie","enabled":true,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$P3$transport$mobileComboSelected', '');
            formData.append('ctl00$ctrl_MakeTeeTime$P3$groupNum', '0');

            // Player 4 (Guest - Dennis Francese)
            formData.append('ctl00$ctrl_MakeTeeTime$P4$chkNotify', 'on');
            formData.append('ctl00$ctrl_MakeTeeTime$P4$PCombo$PlayerName', 'Francese,  Dennis');
            formData.append('ctl00_ctrl_MakeTeeTime_P4_PCombo_PlayerName_ClientState',
                '{"logEntries":[],"value":"1036744_Guest","text":"Francese,  Dennis","enabled":true,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$P4$transport$oCombo', 'Riding with Caddie');
            formData.append('ctl00_ctrl_MakeTeeTime_P4_transport_oCombo_ClientState',
                '{"logEntries":[],"value":"205","text":"Riding with Caddie","enabled":true,"checkedIndices":[],"checkedItemsTextOverflows":false}');
            formData.append('ctl00$ctrl_MakeTeeTime$P4$transport$mobileComboSelected', '');
            formData.append('ctl00$ctrl_MakeTeeTime$P4$groupNum', '0');

            // Additional required fields from your sample request
            formData.append('ctl00_ctrl_MakeTeeTime_tsOptions_ClientState', '{"selectedIndexes":["0"],"logEntries":[],"scrollState":{}}');
            formData.append('ctl00$ctrl_MakeTeeTime$drpNotEarlierThan$tCombo', '');
            formData.append('ctl00_ctrl_MakeTeeTime_drpNotEarlierThan_tCombo_ClientState', '');
            formData.append('ctl00$ctrl_MakeTeeTime$drpNotLaterThan$tCombo', '');
            formData.append('ctl00_ctrl_MakeTeeTime_drpNotLaterThan_tCombo_ClientState', '');
            formData.append('ctl00$ctrl_MakeTeeTime$drpCourseExclude$oCombo', '');
            formData.append('ctl00_ctrl_MakeTeeTime_drpCourseExclude_oCombo_ClientState', '');
            formData.append('ctl00$ctrl_MakeTeeTime$drpCourseExclude$mobileComboSelected', '');

            formData.append('ctl00$ctrl_MakeTeeTime$txtComments', 'Write a comment');
            formData.append('ctl00_ctrl_MakeTeeTime_txtComments_ClientState', '{"enabled":true,"emptyMessage":"Write a comment","validationText":"","valueAsString":"","lastSetTextBoxValue":"Write a comment"}');
            formData.append('ctl00$ctrl_MakeTeeTime$txtNotes', 'Write a note');
            formData.append('ctl00_ctrl_MakeTeeTime_txtNotes_ClientState', '{"enabled":true,"emptyMessage":"Write a note","validationText":"","valueAsString":"","lastSetTextBoxValue":"Write a note"}');

            formData.append('ctl00$ctrl_MakeTeeTime$ddlRecurr$tCombo', 'No Schedule');
            formData.append('ctl00_ctrl_MakeTeeTime_ddlRecurr_tCombo_ClientState', '');
            formData.append('ctl00$ctrl_MakeTeeTime$rdRecurrEnd$tMDateBox', '');
            formData.append('ctl00$ctrl_MakeTeeTime$rdRecurrEnd$mobileDateBoxSelected', '');
            formData.append('ctl00$ctrl_MakeTeeTime$drpStatus$tCombo', '');
            formData.append('ctl00_ctrl_MakeTeeTime_drpStatus_tCombo_ClientState', '');
            formData.append('ctl00_ctrl_MakeTeeTime_mpOptions_ClientState', '');

            formData.append('ctl00$ctrl_MakeTeeTime$playersUpdated', '1');
            formData.append('ctl00$ctrl_MakeTeeTime$removePlayerNumber', '0');
            formData.append('PageX', '0');
            formData.append('PageY', '0');
            formData.append('__ASYNCPOST', 'true');
            formData.append('RadAJAXControlID', 'defaultRAM');

            // Make the actual booking request
            console.log('Making booking request...');
            console.log(`🔍 DEBUG: Booking slot.time = "${slot.time}" for date ${slot.date}`);
            console.log(`🔍 DEBUG: Form data time field = "${formData.get('ctl00$ctrl_MakeTeeTime$drpTime$tCombo')}"`);
            
            const response = await this.client.post(
                `${this.baseURL}/dialog.aspx`,
                formData.toString(),
                {
                    params: {
                        p: 'NetcaddyPop',
                        tt: 'MakeTeeTime',
                        NoModResize: '1',
                        NoNav: '1',
                        ShowFooter: 'False',
                        courseid: slot.courseId,
                        date: encodeURIComponent(slot.date),
                        time: encodeURIComponent(slot.time),
                        hole: slot.tee === '1st TEE' ? '1' : '10',
                        numholes: '0',
                        xsome: '4',
                        startletter: ''
                    },
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-Microsoftajax': 'Delta=true',
                        'Cache-Control': 'no-cache',
                        'Accept': '*/*',
                        'Origin': 'https://www.trumpcoltsneck.com',
                        'Sec-Fetch-Site': 'same-origin',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Dest': 'empty',
                        'Referer': 'https://www.trumpcoltsneck.com/',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Priority': 'u=1, i'
                    }
                }
            );

            // Check if booking was successful
            const responseText = response.data;
            console.log('Reservation response received, length:', responseText.length);
            
            // Save response for debugging
            fs.writeFileSync('booking_response.html', responseText);
            console.log('🔍 DEBUG: Saved booking response to booking_response.html');

            // Parse actual booked time from response
            let actualBookedTime = slot.time; // Default to what we requested
            
            // Try to extract actual booked time from response
            const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM))/gi;
            const timeMatches = responseText.match(timePattern);
            if (timeMatches && timeMatches.length > 0) {
                // Look for time patterns in the response that might indicate the actual booking
                console.log('🔍 DEBUG: Found time patterns in response:', timeMatches);
                // For now, just log them - we'll need to analyze the response structure
            }

            if (responseText.includes('successfully') || responseText.includes('confirmed') || responseText.includes('Confirmation')) {
                console.log(`✅ Booking confirmed! Requested: ${slot.time}, Checking actual booked time...`);
                return {
                    success: true,
                    message: 'Booking confirmed!',
                    slot: {
                        ...slot,
                        requestedTime: slot.time,
                        actualTime: actualBookedTime
                    },
                    response: responseText.substring(0, 500)
                };
            } else if (responseText.includes('error') || responseText.includes('failed')) {
                return {
                    success: false,
                    message: 'Booking failed - error in response',
                    response: responseText.substring(0, 500)
                };
            } else {
                return {
                    success: false,
                    message: 'Booking response unclear - check logs',
                    response: responseText.substring(0, 500)
                };
            }
        } catch (error) {
            console.error('Reservation error:', error.message);
            return {
                success: false,
                error: error.message,
                response: error.response?.data?.substring(0, 500)
            };
        }
    }

    // Main function to find and book best available slot
    async findAndBookBestSlot(date, preferredTime, maxTime, guests) {
        try {
            console.log(`Looking for slots on ${date} between ${preferredTime} and ${maxTime}`);

            // Get tee sheet
            const teeSheet = await this.getTeeSheet(date);

            if (!teeSheet.available) {
                return {
                    success: false,
                    message: teeSheet.message,
                    countdown: teeSheet.countdown
                };
            }

            // Filter available slots by time preference
            const preferredTimeMin = this.timeToMinutes(preferredTime);
            const maxTimeMin = this.timeToMinutes(maxTime);

            console.log(`Time range in minutes: ${preferredTimeMin} to ${maxTimeMin}`);

            const availableSlots = teeSheet.slots.filter(slot => {
                if (!slot.canReserve || slot.availableSpots === 0) return false;

                const slotMin = this.timeToMinutes(slot.time);
                const inRange = slotMin >= preferredTimeMin && slotMin <= maxTimeMin;

                console.log(`Slot ${slot.time} (${slotMin} min): ${inRange ? 'IN RANGE' : 'OUT OF RANGE'}`);
                return inRange;
            });

            console.log(`Found ${availableSlots.length} slots in preferred time range`);

            if (availableSlots.length === 0) {
                return {
                    success: false,
                    message: `No available slots between ${preferredTime} and ${maxTime}`,
                    totalAvailable: teeSheet.slots.length,
                    allSlots: teeSheet.slots.map(s => ({
                        time: s.time,
                        spots: s.availableSpots
                    }))
                };
            }

            // Try to book the first available slot
            const targetSlot = availableSlots[0];
            console.log(`Attempting to book: ${targetSlot.time} with ${targetSlot.availableSpots} spots`);

            const result = await this.makeReservation(targetSlot, guests);

            return result;
        } catch (error) {
            console.error('findAndBookBestSlot error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default GolfBookingService;