/* eslint-disable no-unused-vars, camelcase, react/no-unescaped-entities */
import {
  API_BASE_URL,
  AZURE_LOGIN_URL,
  AZURE_OTP_VERIFY_URL,
} from '../config/apiBase';
import {agentApi, authApi, chatApi, mailerApi} from '../services/socialApi';
import {getStableDeviceId} from '../utils/deviceId';
import {encrypt} from '../utils/encryption';
import {logger} from '../utils/logger';

import axios from 'axios';
import {getCountries, getCountryCallingCode} from 'libphonenumber-js';
import {X, User, ChevronDown, Mail, Phone, Search} from 'lucide-react';
import {RefreshCw, Wifi, WifiOff} from 'lucide-react';
import React, {useState, useEffect} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate} from 'react-router-dom';
import {v4 as uuidv4} from 'uuid';

// Three-word name generator word lists (Adjective.Color.Username format)
const ADJECTIVES = [
  'Happy',
  'Swift',
  'Clever',
  'Brave',
  'Gentle',
  'Mighty',
  'Calm',
  'Bright',
  'Wise',
  'Kind',
  'Noble',
  'Quick',
  'Silent',
  'Wild',
  'Cosmic',
  'Golden',
  'Silver',
  'Crystal',
  'Mystic',
  'Ancient',
  'Radiant',
  'Serene',
  'Stellar',
];

const COLORS = [
  'Blue',
  'Green',
  'Red',
  'Purple',
  'Orange',
  'Teal',
  'Coral',
  'Indigo',
  'Amber',
  'Jade',
  'Ruby',
  'Sapphire',
  'Emerald',
  'Crimson',
  'Azure',
  'Violet',
];

// Generate base two-word prefix (Adjective.Color)
const generateBaseTwoWordPrefix = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return `${adj}.${color}`;
};

// Generate full three-word name (Adjective.Color.Username)
const generateThreeWordName = (username = '') => {
  const prefix = generateBaseTwoWordPrefix();
  if (username && username.trim()) {
    // Clean username: remove spaces, use first part if multiple words
    const cleanUsername = username
      .trim()
      .split(/\s+/)[0]
      .replace(/[^a-zA-Z0-9]/g, '');
    return `${prefix}.${cleanUsername}`;
  }
  return prefix;
};

const OtpAuthModal = ({isOpen, onClose, message, forceGuestMode = false}) => {
  const navigate = useNavigate();
  const [countryCode, setCountryCode] = useState('IN');
  const [loginMethod, setLoginMethod] = useState('phone');
  const [searchQuery, setSearchQuery] = useState('');

  const [countries, setCountries] = useState([]);
  const [filteredCountries, setFilteredCountries] = useState([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otp, setOtp] = useState('');
  const [alert, setAlert] = useState(false);
  const [alertContent, setAlertContent] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [expireTime, setExpireTime] = useState();

  const [startTime, setStartTime] = useState(null);
  const [intervalId, setIntervalId] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Show guest mode if forced (e.g., /local route) or if actually offline
  const showGuestMode = forceGuestMode || isOffline;
  // Detect returning guest (name saved from previous session)
  const savedGuestName = localStorage.getItem('guest_name') || '';
  const isReturningGuest = showGuestMode && !!savedGuestName;
  const [userNameInput, setUserNameInput] = useState('');
  const [namePrefix, setNamePrefix] = useState(() =>
    generateBaseTwoWordPrefix()
  );
  const [guestName, setGuestName] = useState('');
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState(null); // null = unchecked, true/false
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const countryData = getCountries().map((country) => ({
      code: country,
      dialCode: `+${getCountryCallingCode(country)}`,
      name: new Intl.DisplayNames(['en'], {type: 'region'}).of(country),
    }));

    countryData.sort((a, b) => a.name.localeCompare(b.name));
    setCountries(countryData);
    setFilteredCountries(countryData);
  }, []);

  useEffect(() => {
    const filtered = countries.filter(
      (country) =>
        country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        country.dialCode.includes(searchQuery) ||
        country.code.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredCountries(filtered);
  }, [searchQuery, countries]);

  // OTP countdown timer (120 seconds)
  useEffect(() => {
    if (!showOtpInput) {
      setOtpCountdown(0);
      return;
    }
    setOtpCountdown(120);
    const timer = setInterval(() => {
      setOtpCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showOtpInput]);

  const getFullPhoneNumber = () => {
    const selectedCountry = countries.find((c) => c.code === countryCode);
    const dialCode = selectedCountry ? selectedCountry.dialCode : '+91';
    return `${dialCode}${phoneNumber}`;
  };

  const handlePhoneNumberChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    setPhoneNumber(value);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleCountrySelect = (country) => {
    setCountryCode(country.code);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const resetForm = () => {
    setPhoneNumber('');
    setEmail('');
    setOtp('');
    setShowOtpInput(false);
    setAlert(false);
    setAlertContent('');
    setSearchQuery('');
  };

  const validate = () => {
    if (loginMethod === 'phone' && !phoneNumber) {
      setAlert(true);
      setAlertContent('Please enter your phone number');
      return false;
    }
    if (loginMethod === 'email' && !email) {
      setAlert(true);
      setAlertContent('Please enter your email address');
      return false;
    }
    if (loginMethod === 'email' && !/\S+@\S+\.\S+/.test(email)) {
      setAlert(true);
      setAlertContent('Please enter a valid email address');
      return false;
    }
    return true;
  };
  const handleSendOtp = async (event) => {
    event.preventDefault();
    if (isProcessing) return;

    if (!validate()) {
      return false;
    }

    setIsProcessing(true);
    try {
      const payload =
        loginMethod === 'phone'
          ? {phone_number: getFullPhoneNumber()}
          : {phone_number: email};

      // Use Azure Kong /data/login (queries User table with phone normalization)
      // NOT mailer.hertzai.com/verifyTeacherByPhone (queries Teacher table, no normalization)
      const resp = await fetch(AZURE_LOGIN_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        setShowOtpInput(true);
        setAlert(false);
      } else {
        const errBody = await resp.json().catch(() => ({}));
        if (errBody?.detail?.includes('is not registered')) {
          setAlertContent(
            'It looks like you don\u2019t have an account yet. Sign up to get started!'
          );
        } else {
          setAlertContent(errBody?.detail || 'Login failed. Please try again.');
        }
        setAlert(true);
      }
    } catch (error) {
      console.warn('OTP send failed:', error.message || error);
      setAlert(true);
      setAlertContent(
        'It looks like you don\u2019t have an account yet. Sign up to get started!'
      );
      return false;
    } finally {
      setIsProcessing(false);
    }
  };
  const encryptData = (userId, emailAddress) => {
    return {
      encryptedUserId: encrypt(userId),
      encryptedEmailAddress: encrypt(emailAddress),
    };
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      const payload =
        loginMethod === 'phone'
          ? {phone_number: getFullPhoneNumber(), otp}
          : {phone_number: email, otp};

      const verifyResp = await fetch(AZURE_OTP_VERIFY_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });

      if (verifyResp.ok) {
        const data = await verifyResp.json();
        logger.log(data, 'this is the data');
        const accessToken = String(data.access_token);
        const userId = String(data.user_id);
        const emailAddress = String(data.email_address);
        const refresh_token = String(data?.refresh_token);

        try {
          const encryptedUserId = encrypt(userId);
          const encryptedEmailAddress = encrypt(emailAddress);
          const encryptedRefreshToken = encrypt(refresh_token);

          const expireTokenTime = data.expires_in;
          setExpireTime(expireTokenTime);

          localStorage.setItem('expire_token', expireTokenTime);
          localStorage.setItem('access_token', accessToken);
          localStorage.setItem('user_id', encryptedUserId);
          localStorage.setItem('email_address', encryptedEmailAddress);
          localStorage.setItem('refresh_token', encryptedRefreshToken);

          // Migrate guest agent data before clearing
          const guestUserId = localStorage.getItem('guest_user_id');
          if (guestUserId) {
            chatApi
              .migrateAgents({
                guest_user_id: guestUserId,
                new_user_id: userId,
              })
              .catch((err) =>
                console.warn('Agent migration (non-blocking):', err)
              );
          }

          // Clear guest mode if transitioning to real login
          localStorage.removeItem('guest_mode');
          localStorage.removeItem('guest_name');
          localStorage.removeItem('guest_user_id');
          localStorage.removeItem('guest_name_verified');

          resetForm();
          onClose();
          navigate('/agents/Hevolve');

          const startLoginTime = Date.now();
          setStartTime(startLoginTime);

          const interval = setInterval(() => {
            const remainingTime =
              expireTokenTime * 1000 - (Date.now() - startLoginTime);

            if (remainingTime <= 5000) {
              renewToken(userId);
              clearInterval(interval);
            }
          }, 1000);

          setIntervalId(interval);
        } catch (encryptionError) {
          throw new Error('Failed to encrypt user data');
        }
      } else {
        const errBody = await verifyResp.json().catch(() => ({}));
        setAlertContent(errBody?.detail || 'Invalid OTP. Please try again.');
        setAlert(true);
      }
    } catch (error) {
      console.error('OTP verify actual error:', error);
      setAlertContent('Login failed: ' + (error.message || error));
      setAlert(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const renewToken = async (userId) => {
    try {
      const result = await mailerApi.renewToken({user_id: userId});
      // mailerApi auto-unwraps; result is the response body
      const newAccessToken = String(result.access_token);
      localStorage.setItem('expire_token', newAccessToken);
    } catch (renewError) {
      console.error('Error renewing token', renewError);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Update full guest name when user input or prefix changes (Adjective.Color.Username format)
  useEffect(() => {
    if (userNameInput.trim()) {
      const cleanUsername = userNameInput
        .trim()
        .split(/\s+/)[0]
        .replace(/[^a-zA-Z0-9]/g, '');
      setGuestName(`${namePrefix}.${cleanUsername}`);
    } else {
      setGuestName('');
    }
    setNameAvailable(null); // Reset validation status
  }, [userNameInput, namePrefix]);

  // Validate name against cloud when online (debounced)
  useEffect(() => {
    if (isOffline || !guestName) return;

    const timeoutId = setTimeout(async () => {
      setIsCheckingName(true);
      try {
        const result = await agentApi.checkHandle(guestName);
        setNameAvailable(result?.available !== false);
      } catch (err) {
        // If check fails, assume available (offline-first)
        setNameAvailable(true);
      } finally {
        setIsCheckingName(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [guestName, isOffline]);

  const regeneratePrefix = () => {
    setNamePrefix(generateBaseTwoWordPrefix());
  };

  const [recoveryCode, setRecoveryCode] = useState('');
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [showRecoverMode, setShowRecoverMode] = useState(false);
  const [recoverInput, setRecoverInput] = useState('');

  const handleGuestLogin = async () => {
    if (isProcessing) return;
    // Validate user entered their name
    if (!userNameInput.trim()) {
      setAlert(true);
      setAlertContent(
        'Please enter your name to create your unique agent handle'
      );
      return;
    }

    // Check if name is available (when online)
    if (!isOffline && nameAvailable === false) {
      setAlert(true);
      setAlertContent(
        'This name is already taken. Try a different combination.'
      );
      return;
    }

    setIsProcessing(true);
    const finalName = guestName.trim();

    try {
      const deviceId = await getStableDeviceId();

      // Try backend registration first (persists identity)
      if (!isOffline) {
        try {
          const res = await authApi.guestRegister({
            guest_name: finalName,
            device_id: deviceId,
          });
          const {user, token, recovery_code} = res.data;
          localStorage.setItem('access_token', token);
          localStorage.setItem('guest_mode', 'true');
          localStorage.setItem('guest_name', finalName);
          localStorage.setItem('guest_user_id', user.id);
          localStorage.setItem('social_user_id', user.id);
          localStorage.setItem('guest_name_verified', 'true');
          // Show one-time recovery code
          setRecoveryCode(recovery_code);
          setShowRecoveryCode(true);
          return;
        } catch {
          // Backend unavailable — fall through to offline mode
        }
      }

      // Offline fallback: localStorage only
      localStorage.setItem('guest_mode', 'true');
      localStorage.setItem('guest_name', finalName);
      localStorage.setItem('guest_user_id', deviceId);
      localStorage.setItem('guest_name_verified', isOffline ? 'false' : 'true');
      resetForm();
      onClose();
      navigate('/agents/Hevolve');
    } finally {
      setIsProcessing(false);
    }
  };

  // Quick re-login for returning guests (no name entry needed)
  const handleReturningGuestLogin = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const deviceId = await getStableDeviceId();
      const res = await authApi.guestRegister({
        guest_name: savedGuestName,
        device_id: deviceId,
      });
      const {user, token} = res.data;
      localStorage.setItem('access_token', token);
      localStorage.setItem('guest_mode', 'true');
      localStorage.setItem('guest_name', savedGuestName);
      localStorage.setItem('guest_user_id', user.id);
      localStorage.setItem('social_user_id', user.id);
      localStorage.setItem('guest_name_verified', 'true');
      resetForm();
      onClose();
      navigate('/agents/Hevolve');
    } catch {
      // Backend unavailable — just restore localStorage state and continue
      localStorage.setItem('guest_mode', 'true');
      localStorage.setItem('guest_name', savedGuestName);
      resetForm();
      onClose();
      navigate('/agents/Hevolve');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGuestRecover = async () => {
    if (isProcessing) return;
    if (!recoverInput.trim()) {
      setAlert(true);
      setAlertContent('Please enter your 6-word recovery code');
      return;
    }
    setIsProcessing(true);
    try {
      const deviceId = await getStableDeviceId();
      const res = await authApi.guestRecover({
        recovery_code: recoverInput.trim(),
        device_id: deviceId,
      });
      const {user, token} = res.data;
      localStorage.setItem('access_token', token);
      localStorage.setItem('guest_mode', 'true');
      localStorage.setItem('guest_name', user.display_name || user.username);
      localStorage.setItem('guest_user_id', user.id);
      localStorage.setItem('social_user_id', user.id);
      localStorage.setItem('guest_name_verified', 'true');
      resetForm();
      onClose();
      navigate('/agents/Hevolve');
    } catch {
      setAlert(true);
      setAlertContent('Invalid recovery code. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1300]">
      <div className="bg-white rounded-lg p-6 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] overflow-y-auto relative">
        <p>{message || 'Please log in again.'}</p>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-700 btn-press"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <User className="w-6 h-6 text-blue-500" />
          </div>
          <h2 className="text-xl font-semibold">
            {showGuestMode
              ? isReturningGuest
                ? 'Login'
                : 'Guest Login'
              : 'User Sign in'}
          </h2>
          {showGuestMode && !isReturningGuest && (
            <p className="text-sm text-gray-500 mt-1">
              {isOffline ? 'You are offline. ' : 'Local mode. '}Enter your name
              to use local features.
            </p>
          )}
        </div>

        {alert && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {alertContent}
          </div>
        )}

        {/* Recovery code one-time display */}
        {showRecoveryCode && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800 mb-2">
                Your recovery code (save it now!):
              </p>
              <div className="font-mono text-center text-lg bg-white p-3 rounded border border-green-300 select-all">
                {recoveryCode}
              </div>
              <p className="text-xs text-green-600 mt-2">
                This code is shown only once. Use it to recover your identity on
                a new device.
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(recoveryCode);
                setShowRecoveryCode(false);
                resetForm();
                onClose();
                navigate('/agents/Hevolve');
              }}
              className="btn-gradient"
              style={{
                background: 'linear-gradient(to right, #00e89d, #0078ff)',
              }}
            >
              Copy & Continue
            </button>
          </div>
        )}

        {/* Recover guest session mode */}
        {!showRecoveryCode && showRecoverMode && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enter your 6-word recovery code
              </label>
              <input
                type="text"
                value={recoverInput}
                onChange={(e) => setRecoverInput(e.target.value)}
                placeholder="amber breeze coral drift ember frost"
                className="w-full px-4 py-2 border text-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleGuestRecover()}
              />
            </div>
            <button
              onClick={handleGuestRecover}
              disabled={isProcessing}
              className="btn-gradient disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(to right, #00e89d, #0078ff)',
              }}
            >
              {isProcessing ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Recovering...
                </>
              ) : (
                'Recover Session'
              )}
            </button>
            <button
              onClick={() => setShowRecoverMode(false)}
              className="w-full text-sm text-gray-500 hover:text-gray-700 btn-press"
            >
              Back to Guest Login
            </button>
          </div>
        )}

        {!showRecoveryCode && !showRecoverMode && showGuestMode ? (
          isReturningGuest ? (
            /* ── Returning guest — quick "Welcome back" login ── */
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <User size={20} className="text-blue-500" />
                <span className="text-lg font-semibold text-gray-800">
                  Welcome back,{' '}
                  {savedGuestName.split('.').pop() || savedGuestName}!
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Your guest session is ready to continue.
              </p>
              <button
                onClick={handleReturningGuestLogin}
                disabled={isProcessing}
                className="w-full btn-gradient disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(to right, #00e89d, #0078ff)',
                }}
              >
                {isProcessing ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Logging in...
                  </>
                ) : (
                  'Continue as ' +
                  (savedGuestName.split('.').pop() || savedGuestName)
                )}
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('guest_name');
                  localStorage.removeItem('guest_mode');
                  localStorage.removeItem('guest_name_verified');
                  window.location.reload();
                }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Use a different name
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* User name input (becomes suffix) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter your Username
                </label>
                <input
                  type="text"
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  placeholder="Enter your name (e.g., John)"
                  className="w-full px-4 py-2 border text-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={20}
                  onKeyDown={(e) => e.key === 'Enter' && handleGuestLogin()}
                />
                <p className="text-xs text-amber-600 mt-1">
                  This name cannot be changed once taken locally and when
                  validated globally in the Nunba ecosystem.
                </p>
              </div>

              {/* Generated agent handle display */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Agent Handle
                </label>
                <div className="relative">
                  <div className="w-full px-4 py-2 pr-10 border text-gray-800 bg-gray-50 rounded font-mono text-sm flex items-center justify-between">
                    <span>{guestName || `${namePrefix}.[YourName]`}</span>
                    <div className="flex items-center gap-2">
                      {!isOffline && isCheckingName && (
                        <span className="text-xs text-gray-400">
                          checking...
                        </span>
                      )}
                      {!isOffline &&
                        !isCheckingName &&
                        nameAvailable === true && (
                          <span className="text-xs text-green-500">
                            available
                          </span>
                        )}
                      {!isOffline &&
                        !isCheckingName &&
                        nameAvailable === false && (
                          <span className="text-xs text-red-500">taken</span>
                        )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={regeneratePrefix}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-blue-500 transition-colors btn-press"
                    title="Generate new prefix"
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center">
                {isOffline ? (
                  <span className="flex items-center justify-center gap-1">
                    <WifiOff size={12} /> Offline mode - name will be verified
                    when connected
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <Wifi size={12} /> Connected - name uniqueness verified
                    against cloud
                  </span>
                )}
              </p>

              <button
                onClick={handleGuestLogin}
                disabled={
                  isProcessing ||
                  (!isOffline &&
                    !forceGuestMode &&
                    (isCheckingName || nameAvailable === false))
                }
                className="btn-gradient disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(to right, #00e89d, #0078ff)',
                }}
              >
                {isProcessing ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Setting up...
                  </>
                ) : (
                  'Continue as Guest'
                )}
              </button>
              {!isOffline && (
                <button
                  onClick={() => setShowRecoverMode(true)}
                  className="w-full text-sm text-blue-500 hover:text-blue-700 btn-press"
                >
                  Have a recovery code? Recover Guest Session
                </button>
              )}
            </div>
          )
        ) : !showRecoveryCode && !showRecoverMode ? (
          <>
            <div className="flex justify-center space-x-4 mb-6">
              <button
                onClick={() => {
                  setLoginMethod('phone');
                  resetForm();
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-full btn-tab ${
                  loginMethod === 'phone'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                <Phone size={16} />
                <span>Phone</span>
              </button>
              <button
                onClick={() => {
                  setLoginMethod('email');
                  resetForm();
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-full btn-tab ${
                  loginMethod === 'email'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                <Mail size={16} />
                <span>Email</span>
              </button>
            </div>

            {!showOtpInput ? (
              <div className="space-y-4">
                {loginMethod === 'phone' ? (
                  <div className="flex gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        className="flex items-center justify-between w-20 px-3 py-2 text-gray-700 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      >
                        {countries.find((c) => c.code === countryCode)
                          ?.dialCode ?? '+91'}

                        <ChevronDown size={16} />
                      </button>

                      {isDropdownOpen && (
                        <div className="absolute z-10 w-64 mt-1 bg-white border rounded-md shadow-lg">
                          <div className="p-2 border-b">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                              <input
                                type="text"
                                placeholder="Search country..."
                                value={searchQuery}
                                onChange={handleSearchChange}
                                className="w-full pl-8 pr-4 py-2 border rounded text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            {filteredCountries.map((country) => (
                              <button
                                key={country.code}
                                className="block w-full px-4 py-2 text-left text-sm text-black-700 hover:bg-gray-100"
                                onClick={() => handleCountrySelect(country)}
                              >
                                <span className="mr-2">{country.name}</span>
                                <span className="text-gray-500">
                                  {country.dialCode}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <input
                      type="tel"
                      id="phoneNumber"
                      maxLength={14}
                      value={phoneNumber}
                      onChange={handlePhoneNumberChange}
                      placeholder="Enter Phone Number"
                      className="flex-1 px-4 py-2 border text-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter Email Address"
                    className="w-full px-4 py-2 border text-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                <button
                  onClick={handleSendOtp}
                  disabled={isProcessing}
                  className="btn-gradient disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(to right, #00e89d, #0078ff)',
                  }}
                >
                  {isProcessing ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'GET OTP'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    id="otp"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter OTP"
                    className="w-full px-4 py-2 text-gray-700 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={6}
                  />
                  {otpCountdown > 0 ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Code expires in {Math.floor(otpCountdown / 60)}:
                      {String(otpCountdown % 60).padStart(2, '0')}
                    </p>
                  ) : showOtpInput ? (
                    <p className="text-xs text-red-500 mt-1">
                      Code expired — request a new one
                    </p>
                  ) : null}
                </div>
                <button
                  onClick={handleVerifyOtp}
                  disabled={isProcessing}
                  className="btn-gradient disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(to right, #00e89d, #0078ff)',
                  }}
                >
                  {isProcessing ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify OTP'
                  )}
                </button>
              </div>
            )}

            <div className="mt-4 text-center text-sm text-gray-600">
              Don&apos;t have an account?
              <button
                className="text-blue-500 hover:text-blue-700 ml-1"
                onClick={() => {
                  onClose();
                  const element = document.getElementById('signup-section');
                  element?.scrollIntoView({behavior: 'smooth'});
                }}
              >
                Sign Up
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
};

export default OtpAuthModal;
