// src/App.jsx - Complete Updated File with Weekend Auto-Booking and Auto-Refresh
import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Settings, CheckCircle, XCircle, AlertCircle, RefreshCw, Trash2, Play, Zap, LogOut } from 'lucide-react';
import Login from './components/Login';

const App = () => {
    // Authentication state
    const [user, setUser] = useState(null);
    const [isAuthenticating, setIsAuthenticating] = useState(true);
    const [authToken, setAuthToken] = useState(null);
    
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const [bookings, setBookings] = useState([]);
    const [newBooking, setNewBooking] = useState({
        date: '',
        preferredTime: '07:54',
        maxTime: '13:00'
    });
    const [logs, setLogs] = useState({});
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('bookings');
    const [showWeekendsOnly, setShowWeekendsOnly] = useState(false);

    // Weekend auto-booking states
    const [weekendSettings, setWeekendSettings] = useState({ is_enabled: false });
    const [upcomingWeekends, setUpcomingWeekends] = useState([]);
    const [weekendHistory, setWeekendHistory] = useState([]);

    // Auto-refresh states
    const [isCheckingWeekends, setIsCheckingWeekends] = useState(false);
    const [autoRefreshInterval, setAutoRefreshInterval] = useState(null);

    // Use relative paths
    const API_URL = '/api';

    // Authentication functions
    const handleLogin = (userData) => {
        setUser(userData);
        setIsAuthenticating(false);
    };

    const handleLogout = () => {
        localStorage.removeItem('golf_auth_token');
        setUser(null);
        setAuthToken(null);
        stopAutoRefresh();
    };

    const verifyAuth = async () => {
        console.log('Verifying auth...');
        const token = localStorage.getItem('golf_auth_token');
        console.log('Token found:', !!token);
        
        if (!token) {
            console.log('No token, showing login');
            setIsAuthenticating(false);
            return;
        }
        setAuthToken(token);

        try {
            const response = await fetch(`${API_URL}/auth/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    setUser(data.user);
                } else {
                    handleLogout();
                }
            } else {
                handleLogout();
            }
        } catch (error) {
            console.error('Auth verification failed:', error);
            handleLogout();
        }
        console.log('Auth verification complete');
        setIsAuthenticating(false);
    };

    // Helper function to make authenticated API calls
    const authenticatedFetch = async (url, options = {}) => {
        const token = localStorage.getItem('golf_auth_token');
        if (!token) {
            handleLogout();
            return;
        }

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        return response;
    };

    useEffect(() => {
        verifyAuth();
    }, []);

    useEffect(() => {
        if (user) {
            fetchBookings();
            fetchSettings();
            fetchWeekendSettings().then(() => {
                // Start auto-refresh if weekend booking is enabled
                if (weekendSettings.is_enabled) {
                    startAutoRefresh();
                }
            });
            fetchUpcomingWeekends();
            fetchWeekendHistory();
        }

        // Cleanup on unmount
        return () => {
            stopAutoRefresh();
        };
    }, [user]);

    const fetchSettings = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/settings`);
            if (!response) return;
            const data = await response.json();
            if (data.username) {
                setCredentials({ username: data.username, password: '' });
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        }
    };

    const fetchWeekendSettings = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/weekend-settings`);
            if (!response) return;
            const data = await response.json();
            setWeekendSettings(data);
        } catch (error) {
            console.error('Error fetching weekend settings:', error);
        }
    };

    const fetchUpcomingWeekends = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/upcoming-weekends`);
            if (!response) return;
            const data = await response.json();
            setUpcomingWeekends(data);
        } catch (error) {
            console.error('Error fetching upcoming weekends:', error);
        }
    };

    const fetchWeekendHistory = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/weekend-history`);
            if (!response) return;
            const data = await response.json();
            setWeekendHistory(data);
        } catch (error) {
            console.error('Error fetching weekend history:', error);
        }
    };

    // Auto-refresh functions
    const startAutoRefresh = () => {
        // Clear any existing interval
        stopAutoRefresh();

        // Set up new interval for every 30 seconds
        const interval = setInterval(async () => {
            console.log('Periodic weekend status refresh...');
            await fetchUpcomingWeekends();
            await fetchWeekendHistory();
        }, 30000); // 30 seconds

        setAutoRefreshInterval(interval);
    };

    const stopAutoRefresh = () => {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            setAutoRefreshInterval(null);
        }
    };

    const toggleWeekendAutoBooking = async () => {
        setLoading(true);
        setIsCheckingWeekends(true);

        try {
            const newState = !weekendSettings.is_enabled;
            const response = await authenticatedFetch(`${API_URL}/weekend-settings`, {
                method: 'POST',
                body: JSON.stringify({ enabled: newState })
            });

            const data = await response.json();
            if (data.success) {
                setWeekendSettings({ ...weekendSettings, is_enabled: newState });

                if (newState) {
                    // If enabling, show checking message and start auto-refresh
                    setMessage('✅ Weekend auto-booking enabled! Checking for available weekends...');

                    // Refresh every 5 seconds for the first 30 seconds to catch status updates
                    let refreshCount = 0;
                    const tempInterval = setInterval(async () => {
                        console.log('Auto-refreshing weekend status...');
                        await fetchUpcomingWeekends();
                        await fetchWeekendHistory();

                        refreshCount++;
                        if (refreshCount >= 6) { // 30 seconds total (6 * 5 seconds)
                            clearInterval(tempInterval);
                            setIsCheckingWeekends(false);

                            // Then continue with slower refresh every 30 seconds
                            startAutoRefresh();
                        }
                    }, 5000);

                    // Store interval ID for cleanup
                    setAutoRefreshInterval(tempInterval);
                } else {
                    // If disabling, stop auto-refresh
                    setMessage('✅ Weekend auto-booking disabled');
                    stopAutoRefresh();
                    setIsCheckingWeekends(false);
                }

                fetchUpcomingWeekends();
            }
        } catch (error) {
            setMessage('❌ Error updating weekend settings');
            setIsCheckingWeekends(false);
        }
        setLoading(false);
    };

    const fetchBookings = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/bookings`);
            if (!response) return;
            const data = await response.json();
            setBookings(data);

            // Fetch logs for each booking
            for (const booking of data) {
                fetchLogs(booking.id);
            }
        } catch (error) {
            console.error('Error fetching bookings:', error);
        }
    };

    const fetchLogs = async (bookingId) => {
        try {
            const response = await authenticatedFetch(`${API_URL}/logs/${bookingId}`);
            if (!response) return;
            const data = await response.json();
            setLogs(prev => ({ ...prev, [bookingId]: data }));
        } catch (error) {
            console.error('Error fetching logs:', error);
        }
    };

    const updateCredentials = async () => {
        setLoading(true);
        setMessage('');
        try {
            const response = await authenticatedFetch(`${API_URL}/settings/credentials`, {
                method: 'POST',
                body: JSON.stringify(credentials)
            });
            const data = await response.json();

            if (data.success) {
                setMessage('✅ Credentials updated and verified successfully!');
                setCredentials({ ...credentials, password: '' });
            } else {
                setMessage('❌ Authentication failed. Please check your credentials.');
            }
        } catch (error) {
            setMessage('❌ Error updating credentials: ' + error.message);
        }
        setLoading(false);
    };

    const addBooking = async () => {
        if (!newBooking.date) {
            setMessage('❌ Please select a date');
            return;
        }

        setLoading(true);
        try {
            const response = await authenticatedFetch(`${API_URL}/bookings`, {
                method: 'POST',
                body: JSON.stringify(newBooking)
            });
            const data = await response.json();

            if (data.success) {
                setMessage(`✅ Booking scheduled! Opens at: ${formatDateTime(data.opensAt)}`);
                setNewBooking({ date: '', preferredTime: '07:54', maxTime: '13:00' });
                fetchBookings();
            }
        } catch (error) {
            setMessage('❌ Error adding booking: ' + error.message);
        }
        setLoading(false);
    };

    const deleteBooking = async (id) => {
        if (!confirm('Are you sure you want to delete this booking?')) return;

        try {
            const response = await authenticatedFetch(`${API_URL}/bookings/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                let errorMessage = `Server error: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    // Response wasn't JSON
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();

            if (data.success) {
                setMessage('✅ Booking deleted successfully');
                setBookings(prevBookings =>
                    prevBookings.filter(booking => booking.id !== id)
                );
                setLogs(prevLogs => {
                    const newLogs = { ...prevLogs };
                    delete newLogs[id];
                    return newLogs;
                });
            } else {
                throw new Error(data.error || 'Failed to delete booking');
            }
        } catch (error) {
            console.error('Delete error:', error);
            setMessage(`❌ Error: ${error.message}`);
            fetchBookings();
        }
    };

    const triggerBooking = async (id) => {
        setLoading(true);
        try {
            const response = await authenticatedFetch(`${API_URL}/bookings/${id}/trigger`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                setMessage(`✅ Booking successful! Time: ${data.slot?.time || 'Unknown'}`);
            } else {
                setMessage(`❌ Booking failed: ${data.message || data.error}`);
            }

            fetchBookings();
            fetchLogs(id);
        } catch (error) {
            setMessage('❌ Error triggering booking: ' + error.message);
        }
        setLoading(false);
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'booked': return <CheckCircle className="text-green-500" size={20} />;
            case 'failed': return <XCircle className="text-red-500" size={20} />;
            case 'no_slots': return <AlertCircle className="text-orange-500" size={20} />;
            case 'already_booked': return <CheckCircle className="text-blue-500" size={20} />;
            case 'scheduled': return <Clock className="text-blue-500" size={20} />;
            default: return <AlertCircle className="text-yellow-500" size={20} />;
        }
    };

    const getAvailableDates = (daysAhead = 30) => {
        const dates = [];
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        for (let i = 0; i <= daysAhead; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            date.setHours(12, 0, 0, 0);

            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 6 || dayOfWeek === 0;

            if (!showWeekendsOnly || isWeekend) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const dateString = `${year}-${month}-${day}`;

                dates.push({
                    value: dateString,
                    date: date,
                    isWeekend: isWeekend,
                    dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
                    display: date.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric'
                    })
                });
            }
        }

        return dates;
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return 'N/A';
        
        let date;
        try {
            // Try to parse the date string directly first
            date = new Date(dateStr);
            
            // If it's an invalid date, try appending 'Z' for UTC
            if (isNaN(date.getTime())) {
                date = new Date(dateStr + 'Z');
            }
            
            // If still invalid, return error
            if (isNaN(date.getTime())) {
                return 'Invalid Date';
            }
            
        } catch (error) {
            return 'Invalid Date';
        }
        
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/New_York'
        });
    };

    console.log('Render state:', { isAuthenticating, user: !!user });

    // Show loading screen while authenticating
    if (isAuthenticating) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // Show login page if not authenticated
    if (!user) {
        console.log('Showing login page');
        return <Login onLogin={handleLogin} />;
    }

    console.log('Showing main app');

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="container mx-auto p-4 max-w-7xl">
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800 mb-2">⛳ Golf Tee Time Automation</h1>
                            <p className="text-gray-600">Trump National Colts Neck - Automated Booking System</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600">Welcome, {user.username}</span>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md"
                                title="Logout"
                            >
                                <LogOut size={16} />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>

                {message && (
                    <div className={`mb-4 p-4 rounded-lg ${message.includes('✅') ? 'bg-green-100' : 'bg-red-100'}`}>
                        {message}
                    </div>
                )}

                <div className="bg-white rounded-lg shadow-md mb-6">
                    <div className="flex border-b">
                        <button
                            onClick={() => setActiveTab('bookings')}
                            className={`px-6 py-3 font-semibold ${activeTab === 'bookings' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                        >
                            <Calendar className="inline mr-2" size={20} />
                            Manual Bookings
                        </button>
                        <button
                            onClick={() => setActiveTab('weekend')}
                            className={`px-6 py-3 font-semibold ${activeTab === 'weekend' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                        >
                            <Zap className="inline mr-2" size={20} />
                            Weekend Auto-Booking
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`px-6 py-3 font-semibold ${activeTab === 'settings' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                        >
                            <Settings className="inline mr-2" size={20} />
                            Settings
                        </button>
                    </div>

                    <div className="p-6">
                        {activeTab === 'bookings' && (
                            <div>
                                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                                    <h3 className="font-semibold mb-3 text-lg">Add New Manual Booking</h3>

                                    <div className="mb-3">
                                        <label className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={showWeekendsOnly}
                                                onChange={(e) => setShowWeekendsOnly(e.target.checked)}
                                                className="rounded"
                                            />
                                            <span>Show weekends only (Saturday & Sunday)</span>
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <select
                                            value={newBooking.date}
                                            onChange={(e) => setNewBooking({ ...newBooking, date: e.target.value })}
                                            className="p-2 border rounded-md"
                                        >
                                            <option value="">Select Date</option>
                                            {getAvailableDates(30).map(dateInfo => (
                                                <option key={dateInfo.value} value={dateInfo.value}>
                                                    {dateInfo.display} {dateInfo.isWeekend && '⛳'}
                                                </option>
                                            ))}
                                        </select>

                                        <div>
                                            <input
                                                type="time"
                                                value={newBooking.preferredTime}
                                                onChange={(e) => setNewBooking({ ...newBooking, preferredTime: e.target.value })}
                                                className="w-full p-2 border rounded-md"
                                                title="Preferred Time"
                                            />
                                            <span className="text-xs text-gray-500">Preferred time</span>
                                        </div>

                                        <div>
                                            <input
                                                type="time"
                                                value={newBooking.maxTime}
                                                onChange={(e) => setNewBooking({ ...newBooking, maxTime: e.target.value })}
                                                className="w-full p-2 border rounded-md"
                                                title="Latest Acceptable Time"
                                            />
                                            <span className="text-xs text-gray-500">Latest time</span>
                                        </div>

                                        <button
                                            onClick={addBooking}
                                            disabled={loading}
                                            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:opacity-50 h-fit"
                                        >
                                            {loading ? 'Adding...' : 'Add Booking'}
                                        </button>
                                    </div>

                                    <div className="mt-2 text-xs text-gray-600">
                                        💡 Tip: Bookings open 1 week in advance at 6:30 AM Eastern. Weekend dates are marked with ⛳
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold text-lg mb-3">Scheduled Manual Bookings</h3>
                                    {bookings.filter(b => b.booking_type === 'manual').length === 0 ? (
                                        <p className="text-gray-500">No manual bookings scheduled yet.</p>
                                    ) : (
                                        bookings.filter(b => b.booking_type === 'manual').map(booking => (
                                            <div key={booking.id} className="border rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        {getStatusIcon(booking.status)}
                                                        <div>
                                                            <h4 className="font-semibold">
                                                                {booking.date ? (
                                                                    new Date(booking.date).toLocaleDateString('en-US', {
                                                                        weekday: 'long',
                                                                        year: 'numeric',
                                                                        month: 'long',
                                                                        day: 'numeric'
                                                                    })
                                                                ) : (
                                                                    'No date available'
                                                                )}
                                                                {booking.date &&
                                                                    (new Date(booking.date).getDay() === 0 ||
                                                                        new Date(booking.date).getDay() === 6) && ' ⛳'}
                                                            </h4>
                                                            <p className="text-sm text-gray-600">
                                                                Preferred: {booking.preferred_time} | Max: {booking.max_time}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                Opens: {new Date(booking.booking_opens_at).toLocaleString()}
                                                            </p>
                                                            {booking.attempts > 0 && (
                                                                <p className="text-xs text-gray-500">
                                                                    Attempts: {booking.attempts} | Last: {booking.last_attempt ? (() => {
                                                                        try {
                                                                            const date = new Date(booking.last_attempt);
                                                                            if (isNaN(date.getTime())) return 'Invalid';
                                                                            // Assume database is UTC, subtract 4 hours for EDT
                                                                            date.setHours(date.getHours() - 4);
                                                                            return date.toLocaleString('en-US', {
                                                                                month: 'short', day: 'numeric', hour: 'numeric', 
                                                                                minute: '2-digit', hour12: true
                                                                            });
                                                                        } catch (e) {
                                                                            return 'Error';
                                                                        }
                                                                    })() : 'N/A'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => triggerBooking(booking.id)}
                                                            disabled={loading || booking.status === 'booked'}
                                                            className="p-2 text-blue-500 hover:bg-blue-50 rounded disabled:opacity-50"
                                                            title="Test Booking Now"
                                                        >
                                                            <Play size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => fetchLogs(booking.id)}
                                                            className="p-2 text-gray-500 hover:bg-gray-50 rounded"
                                                            title="Refresh Logs"
                                                        >
                                                            <RefreshCw size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteBooking(booking.id)}
                                                            className="p-2 text-red-500 hover:bg-red-50 rounded"
                                                            title="Delete Booking"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {logs[booking.id] && logs[booking.id].length > 0 && (
                                                    <div className="mt-3 pt-3 border-t">
                                                        <p className="text-sm font-semibold mb-2">Recent Activity:</p>
                                                        <div className="space-y-1">
                                                            {logs[booking.id].slice(0, 3).map(log => (
                                                                <div key={log.id} className="text-xs text-gray-600">
                                                                    <span className={log.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                                                                        {log.status === 'success' ? '✓' : '✗'}
                                                                    </span>
                                                                    {' '}
                                                                    {log.created_at ? (() => {
                                                                        try {
                                                                            const date = new Date(log.created_at);
                                                                            if (isNaN(date.getTime())) return 'Invalid';
                                                                            // Assume database is UTC, subtract 4 hours for EDT
                                                                            date.setHours(date.getHours() - 4);
                                                                            return date.toLocaleString('en-US', {
                                                                                month: 'short', day: 'numeric', hour: 'numeric', 
                                                                                minute: '2-digit', hour12: true
                                                                            });
                                                                        } catch (e) {
                                                                            return 'Error';
                                                                        }
                                                                    })() : 'N/A'} - {log.action}: {log.message}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'weekend' && (
                            <div>
                                {/* Weekend Auto-Booking Control */}
                                <div className="mb-6 p-4 bg-green-50 rounded-lg">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-semibold text-lg">⛳ Weekend Auto-Booking System</h3>
                                        <button
                                            onClick={toggleWeekendAutoBooking}
                                            disabled={loading}
                                            className={`px-6 py-2 rounded-md font-semibold ${
                                                weekendSettings.is_enabled
                                                    ? 'bg-red-500 text-white hover:bg-red-600'
                                                    : 'bg-green-500 text-white hover:bg-green-600'
                                            } disabled:opacity-50`}
                                        >
                                            {loading ? 'Updating...' : (weekendSettings.is_enabled ? 'Disable' : 'Enable')}
                                        </button>
                                    </div>

                                    <div className={`p-3 rounded ${weekendSettings.is_enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
                                        <p className="font-semibold mb-2">
                                            Status: {weekendSettings.is_enabled ? '✅ ACTIVE' : '🔴 INACTIVE'}
                                            {isCheckingWeekends && ' - 🔄 Checking weekends...'}
                                        </p>
                                        <ul className="text-sm space-y-1">
                                            <li>📅 Books all available Saturday & Sunday slots</li>
                                            <li>🔄 Catch-up mode: Checks every 30 minutes for bookable weekends</li>
                                            <li>⏰ Real-time mode: Books at 6:30 AM EDT when slots open</li>
                                            <li>🕐 Time range: 7:50 AM - 1:00 PM (no expansion if full)</li>
                                            <li>📊 Maximum: 4 weekends booked at once</li>
                                            <li>🚀 Immediate booking attempt when enabled</li>
                                            <li>🔄 Auto-refresh: Updates status automatically</li>
                                        </ul>
                                    </div>

                                    {weekendSettings.is_enabled && (
                                        <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                                            <p className="text-blue-800">
                                                💡 <strong>Smart Booking:</strong> System will immediately check for any weekends
                                                with open booking windows and attempt to book them. Status updates automatically.
                                                {autoRefreshInterval && ' (Auto-refreshing every 30 seconds)'}
                                            </p>
                                        </div>
                                    )}

                                    {isCheckingWeekends && (
                                        <div className="mt-3 p-2 bg-yellow-50 rounded text-sm">
                                            <p className="text-yellow-800 flex items-center">
                                                <RefreshCw className="animate-spin mr-2" size={16} />
                                                Checking for available weekend slots... Status will update automatically.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Upcoming Weekends */}
                                <div className="mb-6">
                                    <h3 className="font-semibold text-lg mb-3">📅 Upcoming Weekend Schedule</h3>
                                    <div className="grid gap-4">
                                        {upcomingWeekends.map((weekend, idx) => {
                                            // Helper function to get status display
                                            const getStatusDisplay = (day) => {
                                                const status = day.actualStatus;
                                                const isEnabled = weekendSettings.is_enabled;

                                                switch(status) {
                                                    case 'booked':
                                                        return {
                                                            color: 'bg-green-100 text-green-800',
                                                            icon: '✅',
                                                            text: day.type === 'weekend_auto' ? 'Auto-Booked' : 'Booked',
                                                            bgColor: 'bg-gray-50'
                                                        };
                                                    case 'no_slots':
                                                        return {
                                                            color: 'bg-red-100 text-red-800',
                                                            icon: '❌',
                                                            text: 'No Slots Available',
                                                            bgColor: 'bg-red-50'
                                                        };
                                                    case 'failed':
                                                        return {
                                                            color: 'bg-orange-100 text-orange-800',
                                                            icon: '⚠️',
                                                            text: 'Failed - Retrying',
                                                            bgColor: 'bg-orange-50'
                                                        };
                                                    case 'open':
                                                        return {
                                                            color: isEnabled ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800',
                                                            icon: isEnabled ? '🔄' : '⏸️',
                                                            text: isEnabled ? 'Checking for Slots' : 'Manual Only',
                                                            bgColor: 'bg-yellow-50'
                                                        };
                                                    case 'scheduled':
                                                        return {
                                                            color: isEnabled ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800',
                                                            icon: isEnabled ? '⏳' : '🔴',
                                                            text: isEnabled ? 'Scheduled' : 'Not Scheduled',
                                                            bgColor: 'bg-blue-50'
                                                        };
                                                    default:
                                                        return {
                                                            color: 'bg-gray-100 text-gray-800',
                                                            icon: '❓',
                                                            text: 'Unknown',
                                                            bgColor: 'bg-gray-50'
                                                        };
                                                }
                                            };

                                            const satStatus = getStatusDisplay(weekend.saturday);
                                            const sunStatus = getStatusDisplay(weekend.sunday);

                                            return (
                                                <div key={idx} className="border rounded-lg p-4">
                                                    <div className="grid md:grid-cols-2 gap-4">
                                                        {/* Saturday */}
                                                        <div className={`p-3 rounded ${satStatus.bgColor}`}>
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <h4 className="font-semibold">
                                                                        Saturday {new Date(weekend.saturday.date + 'T12:00:00').toLocaleDateString('en-US', {
                                                                        month: 'short',
                                                                        day: 'numeric'
                                                                    })}
                                                                    </h4>
                                                                    <p className="text-xs text-gray-600">
                                                                        {weekend.saturday.bookingOpen ?
                                                                            '🟢 Booking window OPEN' :
                                                                            `Opens: ${formatDateTime(weekend.saturday.opensAt)}`}
                                                                    </p>
                                                                    {weekend.saturday.bookedTime && (
                                                                        <p className="text-xs text-green-600 mt-1">
                                                                            Tee time: {weekend.saturday.bookedTime}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${satStatus.color}`}>
                                                                        {satStatus.icon} {satStatus.text}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Sunday */}
                                                        <div className={`p-3 rounded ${sunStatus.bgColor}`}>
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <h4 className="font-semibold">
                                                                        Sunday {new Date(weekend.sunday.date + 'T12:00:00').toLocaleDateString('en-US', {
                                                                        month: 'short',
                                                                        day: 'numeric'
                                                                    })}
                                                                    </h4>
                                                                    <p className="text-xs text-gray-600">
                                                                        {weekend.sunday.bookingOpen ?
                                                                            '🟢 Booking window OPEN' :
                                                                            `Opens: ${formatDateTime(weekend.sunday.opensAt)}`}
                                                                    </p>
                                                                    {weekend.sunday.bookedTime && (
                                                                        <p className="text-xs text-green-600 mt-1">
                                                                            Tee time: {weekend.sunday.bookedTime}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${sunStatus.color}`}>
                                                                        {sunStatus.icon} {sunStatus.text}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                                        <p className="text-gray-700">
                                            <strong>Status Guide:</strong><br/>
                                            🟢 <strong>Booking window OPEN</strong> - Can be booked now<br/>
                                            🔄 <strong>Checking for Slots</strong> - System is searching for available times<br/>
                                            ❌ <strong>No Slots Available</strong> - No times in 7:50 AM - 1:00 PM range<br/>
                                            ⏳ <strong>Scheduled</strong> - Will book when window opens<br/>
                                            ✅ <strong>Booked</strong> - Successfully reserved<br/>
                                            ⏸️ <strong>Manual Only</strong> - Auto-booking disabled, book manually
                                        </p>
                                    </div>

                                    {/* Refresh button */}
                                    <div className="mt-3 text-center">
                                        <button
                                            onClick={async () => {
                                                setIsCheckingWeekends(true);
                                                await fetchUpcomingWeekends();
                                                await fetchWeekendHistory();
                                                setTimeout(() => setIsCheckingWeekends(false), 1000);
                                            }}
                                            disabled={isCheckingWeekends}
                                            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                                        >
                                            <RefreshCw size={14} className={`inline mr-1 ${isCheckingWeekends ? 'animate-spin' : ''}`} />
                                            {isCheckingWeekends ? 'Refreshing...' : 'Refresh Status'}
                                        </button>
                                        {autoRefreshInterval && (
                                            <span className="text-xs text-gray-500 ml-2">
                                                (Auto-refresh active)
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Weekend Booking History */}
                                <div>
                                    <h3 className="font-semibold text-lg mb-3">📊 Recent Weekend Booking Attempts</h3>
                                    {weekendHistory.length === 0 ? (
                                        <p className="text-gray-500">No weekend booking attempts yet.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {weekendHistory.slice(0, 10).map(entry => {
                                                // Parse the date properly
                                                let targetDate;
                                                if (entry.target_date) {
                                                    // Handle MySQL date format (YYYY-MM-DD or ISO string)
                                                    const dateStr = entry.target_date.split('T')[0]; // Get just the date part
                                                    targetDate = new Date(dateStr + 'T12:00:00'); // Add noon time to avoid timezone issues
                                                }

                                                return (
                                                    <div key={entry.id} className="border rounded p-3 text-sm">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                {getStatusIcon(entry.status)}
                                                                <span className="font-semibold">
                                                                    {entry.day_of_week} {targetDate ? targetDate.toLocaleDateString('en-US', {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    year: 'numeric'
                                                                }) : 'Unknown Date'}
                                                                </span>
                                                                {entry.booked_time && (
                                                                    <span className="text-green-600">→ {entry.booked_time}</span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-gray-500">
                                                                {formatDateTime(entry.created_at)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-600 mt-1">
                                                            {entry.error_message || 'Booking attempt made'}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Auto-Booked Items */}
                                <div className="mt-6">
                                    <h3 className="font-semibold text-lg mb-3">⚡ Auto-Booked Weekends</h3>
                                    {bookings.filter(b => b.booking_type === 'weekend_auto').length === 0 ? (
                                        <p className="text-gray-500">No auto-booked weekends yet.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {bookings.filter(b => b.booking_type === 'weekend_auto').map(booking => (
                                                <div key={booking.id} className="border rounded-lg p-3 bg-green-50">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            {getStatusIcon(booking.status)}
                                                            <div>
                                                                <span className="font-semibold">
                                                                    {new Date(booking.date).toLocaleDateString('en-US', {
                                                                        weekday: 'long',
                                                                        month: 'short',
                                                                        day: 'numeric'
                                                                    })} ⛳
                                                                </span>
                                                                <p className="text-xs text-gray-600">
                                                                    Time: {booking.preferred_time} - {booking.max_time}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                                            Auto-Booked
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div>
                                <h3 className="font-semibold text-lg mb-4">Golf Club Credentials</h3>
                                <div className="space-y-4 max-w-md">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={credentials.username}
                                            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                            className="w-full p-2 border rounded-md"
                                            placeholder="Your golf club username"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1">Password</label>
                                        <input
                                            type="password"
                                            value={credentials.password}
                                            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                            className="w-full p-2 border rounded-md"
                                            placeholder="Your golf club password"
                                        />
                                    </div>

                                    <button
                                        onClick={updateCredentials}
                                        disabled={loading || !credentials.username || !credentials.password}
                                        className="bg-green-500 text-white px-6 py-2 rounded-md hover:bg-green-600 disabled:opacity-50"
                                    >
                                        {loading ? 'Verifying...' : 'Update & Verify Credentials'}
                                    </button>

                                    <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                                        <p className="text-sm text-yellow-800">
                                            <strong>Note:</strong> Your credentials are encrypted and stored securely.
                                            The system will use these to automatically log in when booking tee times.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="text-center text-sm text-gray-500 mt-6">
                    <p>Manual bookings check every minute | Weekend auto-booking runs Sat/Sun at 6:30 AM EDT</p>
                    <p>All times are in Eastern Time (EDT/EST)</p>
                </div>
            </div>
        </div>
    );
};

export default App;