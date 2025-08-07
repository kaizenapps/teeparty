// src/App.jsx - Updated for merged service with relative API paths
import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Settings, CheckCircle, XCircle, AlertCircle, RefreshCw, Trash2, Play } from 'lucide-react';

const App = () => {
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

    // Use relative paths - no need for absolute URL anymore
    const API_URL = '/api';

    useEffect(() => {
        fetchBookings();
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const response = await fetch(`${API_URL}/settings`);
            const data = await response.json();
            if (data.username) {
                setCredentials({ username: data.username, password: '' });
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        }
    };

    const fetchBookings = async () => {
        try {
            const response = await fetch(`${API_URL}/bookings`);
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
            const response = await fetch(`${API_URL}/logs/${bookingId}`);
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
            const response = await fetch(`${API_URL}/settings/credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            const response = await fetch(`${API_URL}/bookings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newBooking)
            });
            const data = await response.json();

            if (data.success) {
                setMessage(`✅ Booking scheduled! Opens at: ${new Date(data.opensAt).toLocaleString()}`);
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
            const response = await fetch(`${API_URL}/bookings/${id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            // Check if response is ok
            if (!response.ok) {
                // Try to get error message from response
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
                // Success! Update UI immediately
                setMessage('✅ Booking deleted successfully');

                // Remove from bookings array without refetching
                setBookings(prevBookings =>
                    prevBookings.filter(booking => booking.id !== id)
                );

                // Remove logs for this booking
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

            // Still try to refresh the list in case it was partially deleted
            fetchBookings();
        }
    };

    const triggerBooking = async (id) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/bookings/${id}/trigger`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                setMessage(`✅ Booking successful! Time: ${data.slot}`);
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
            case 'scheduled': return <Clock className="text-blue-500" size={20} />;
            default: return <AlertCircle className="text-yellow-500" size={20} />;
        }
    };

    // Updated function to get dates with option for all days or weekends only
    const getAvailableDates = (daysAhead = 30) => {
        const dates = [];
        const today = new Date();
        today.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues

        for (let i = 0; i <= daysAhead; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            date.setHours(12, 0, 0, 0); // Ensure noon time

            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 6 || dayOfWeek === 0;

            if (!showWeekendsOnly || isWeekend) {
                // Format date as YYYY-MM-DD in local timezone
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

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="container mx-auto p-4 max-w-6xl">
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">⛳ Golf Tee Time Automation</h1>
                    <p className="text-gray-600">Trump National Colts Neck - Automated Booking System</p>
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
                            Bookings
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
                                    <h3 className="font-semibold mb-3 text-lg">Add New Booking</h3>

                                    {/* Weekend filter checkbox */}
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
                                    <h3 className="font-semibold text-lg mb-3">Scheduled Bookings</h3>
                                    {bookings.length === 0 ? (
                                        <p className="text-gray-500">No bookings scheduled yet.</p>
                                    ) : (
                                        bookings.map(booking => (
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
                                                                    Attempts: {booking.attempts} | Last: {new Date(booking.last_attempt).toLocaleString()}
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
                                                                    {new Date(log.created_at).toLocaleString()} - {log.action}: {log.message}
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
                    <p>System checks for bookings every minute. Bookings open exactly 1 week prior at 6:30 AM Eastern.</p>
                    <p>Default guests are automatically selected to avoid member billing.</p>
                </div>
            </div>
        </div>
    );
};

export default App;