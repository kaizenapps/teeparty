// src/components/Login.jsx - Login Component for Golf Booking System
import React, { useState } from 'react';
import { Lock, User, AlertCircle } from 'lucide-react';

const Login = ({ onLogin }) => {
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!credentials.username || !credentials.password) {
            setError('Please enter both username and password');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });

            const data = await response.json();

            if (data.success) {
                // Store token in localStorage
                localStorage.setItem('golf_auth_token', data.token);
                onLogin(data.user);
            } else {
                setError(data.message || 'Invalid credentials');
            }
        } catch (error) {
            setError('Login failed. Please try again.');
            console.error('Login error:', error);
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <div className="mx-auto h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                        <span className="text-2xl">⛳</span>
                    </div>
                    <h2 className="mt-6 text-3xl font-bold text-gray-900">
                        Golf Booking System
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Trump National Colts Neck - Automated Tee Time Booking
                    </p>
                </div>

                <div className="bg-white rounded-lg shadow-lg p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                                Username
                            </label>
                            <div className="mt-1 relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    value={credentials.username}
                                    onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                                    placeholder="Username"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Password
                            </label>
                            <div className="mt-1 relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="password"
                                    type="password"
                                    value={credentials.password}
                                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                                    placeholder="Password"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center space-x-2 text-red-600">
                                <AlertCircle className="h-4 w-4" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <div className="flex items-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Signing In...
                                </div>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                </div>
            </div>
        </div>
    );
};

export default Login;