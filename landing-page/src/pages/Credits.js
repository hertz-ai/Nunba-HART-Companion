import {MAILER_BASE_URL} from '../config/apiBase';
import {mailerApi} from '../services/socialApi';
import {logger} from '../utils/logger';

import {parsePhoneNumberFromString} from 'libphonenumber-js';
import {Clock, AlertTriangle, XCircle, Zap, Timer, Star} from 'lucide-react';
import React, {useState, useEffect, useRef} from 'react';
import {v4 as uuidv4} from 'uuid';


const countryCurrencyCodeMap = {
  IN: 'INR',
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  JP: 'JPY',
  AU: 'AUD',
  CN: 'CNY',
  BR: 'BRL',
  RU: 'RUB',
  ZA: 'ZAR',
  KR: 'KRW',
  MX: 'MXN',
};

const currencySymbolMap = {
  USD: '$',
  INR: '₹',
  CAD: 'C$',
  GBP: '£',
  EUR: '€',
  JPY: '¥',
  AUD: 'A$',
  CNY: '¥',
  BRL: 'R$',
  RUB: '₽',
  ZAR: 'R',
  KRW: '₩',
  MXN: '$',
};

const getCurrencySymbolFromPhone = (phone) => {
  if (!phone) return '₹';
  try {
    const phoneNumber = parsePhoneNumberFromString(phone);
    if (!phoneNumber) return '₹';
    const countryCode = phoneNumber.country;
    const currencyCode = countryCurrencyCodeMap[countryCode];
    return currencySymbolMap[currencyCode] || '₹';
  } catch {
    return '₹';
  }
};

const getUserCreditsFromApi = async (userId, token) => {
  try {
    const response = await fetch(
      `${MAILER_BASE_URL}/getsubscription_by_id/${userId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();

    // Map subscription data to what CreditSystem expects
    return {
      credits: data.creditsLeft || data.credits || 0,
      audioSeconds: data.audioSeconds || 0,
      videoSeconds: data.realisticVideoSeconds || 0,
    };
  } catch (error) {
    console.error('Error fetching user credits:', error);
    return null;
  }
};

const buyUserCreditsFromApi = async (amount, phone_number) => {
  const uuid = uuidv4();
  const truncatedUuid = uuid.replace(/-/g, '').substring(0, 36);
  const transactionid = 'T' + truncatedUuid;

  const paymentPayload = {
    mobile_number: phone_number,
    plan_id: 2,
    transaction_id: transactionid,
    amount: amount,
  };
  logger.log('payload', paymentPayload);
  try {
    // mailerApi auto-unwraps response.data
    const redirect = await mailerApi.makePayment(paymentPayload);
    window.location.href = redirect;
  } catch (error) {
    console.error('Error purchasing credits:', error);
    return {success: false, message: error?.message || 'Payment failed'};
  }
};

const CreditSystem = ({
  userId,
  token,
  onCreditUpdate,
  onTrialExpired,
  isTextMode,
  phone_number,
  currentInteractionType = 'text',
}) => {
  const [userCredits, setUserCredits] = useState(0);
  const [trialTimeRemaining, setTrialTimeRemaining] = useState(5);
  const [isTrialActive, setIsTrialActive] = useState(true);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState(100);
  const [amountError, setAmountError] = useState('');
  const [currentUsage, setCurrentUsage] = useState({
    textWords: 0,
    audioSeconds: 0,
    videoSeconds: 0,
  });
  const [sessionUsage, setSessionUsage] = useState({
    textCredits: 0,
    audioCredits: 0,
    videoCredits: 0,
    totalCredits: 0,
  });

  const trialTimerRef = useRef(null);
  const usageTimerRef = useRef(null);

  const CREDIT_RATES = {
    TEXT_WORDS_PER_CREDIT: 1000,
    AUDIO_SECONDS_PER_CREDIT: 60,
    VIDEO_SECONDS_PER_CREDIT: 3,
  };

  const currencySymbol = getCurrencySymbolFromPhone(phone_number);

  useEffect(() => {
    if (userId && token) {
      initializeUserSession();
    }
  }, [userId, token]);

  useEffect(() => {
    if (!userId || !token) return;
    fetchUserCredits();

    const intervalId = setInterval(fetchUserCredits, 3000000);
    return () => clearInterval(intervalId);
  }, [userId, token]);

  useEffect(() => {
    if (isTrialActive && trialTimeRemaining > 0) {
      trialTimerRef.current = setInterval(() => {
        setTrialTimeRemaining((prev) => {
          if (prev <= 1) {
            endTrial();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (trialTimerRef.current) clearInterval(trialTimerRef.current);
    };
  }, [isTrialActive, trialTimeRemaining]);

  useEffect(() => {
    if (
      !isTrialActive &&
      (currentInteractionType === 'audio' || currentInteractionType === 'video')
    ) {
      const startTime = Date.now();
      usageTimerRef.current = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        setCurrentUsage((prev) => ({
          ...prev,
          [`${currentInteractionType}Seconds`]: elapsedSeconds,
        }));
      }, 1000);
    }
    return () => {
      if (usageTimerRef.current) clearInterval(usageTimerRef.current);
    };
  }, [currentInteractionType, isTrialActive]);

  const fetchUserCredits = async () => {
    const result = await getUserCreditsFromApi(userId, token);
    if (result) {
      setUserCredits((prev) => {
        if (result.credits !== prev && onCreditUpdate) {
          onCreditUpdate(result.credits);
        }
        return result.credits;
      });

      // Update session usage directly from API response
      setSessionUsage((prev) => ({
        ...prev,
        audioCredits: Math.ceil(
          result.audioSeconds / CREDIT_RATES.AUDIO_SECONDS_PER_CREDIT
        ),
        videoCredits: Math.ceil(
          result.videoSeconds / CREDIT_RATES.VIDEO_SECONDS_PER_CREDIT
        ),
        totalCredits:
          Math.ceil(
            result.audioSeconds / CREDIT_RATES.AUDIO_SECONDS_PER_CREDIT
          ) +
          Math.ceil(
            result.videoSeconds / CREDIT_RATES.VIDEO_SECONDS_PER_CREDIT
          ),
      }));

      // Also update the live usage display
      setCurrentUsage((prev) => ({
        ...prev,
        audioSeconds: result.audioSeconds,
        videoSeconds: result.videoSeconds,
      }));
    }
  };

  const initializeUserSession = async () => {
    const result = await getUserCreditsFromApi(userId, token);
    if (result) {
      const {credits, trialUsed, trialTimeLeft} = result;
      setUserCredits(credits || 0);
      if (trialUsed) {
        setIsTrialActive(false);
        setIsTrialExpired(true);
        setTrialTimeRemaining(0);
      } else {
        setTrialTimeRemaining(trialTimeLeft || 60);
        setIsTrialActive(trialTimeLeft > 0);
      }
    } else {
      setIsTrialActive(true);
      setTrialTimeRemaining(60);
    }
  };

  const buyCredits = async (amount) => {
    if (!validateAmount(amount)) return;
    const result = await buyUserCreditsFromApi(amount, phone_number);
    if (result.success) {
      setUserCredits((prev) => {
        const newCredits = prev + amount;
        if (onCreditUpdate) onCreditUpdate(newCredits);
        return newCredits;
      });
      setShowCreditWarning(false);
      setIsTrialExpired(false);
      setCurrentUsage((prev) => ({
        textWords: prev.textWords + amount * CREDIT_RATES.TEXT_WORDS_PER_CREDIT,
        audioSeconds:
          prev.audioSeconds + amount * CREDIT_RATES.AUDIO_SECONDS_PER_CREDIT,
        videoSeconds:
          prev.videoSeconds + amount * CREDIT_RATES.VIDEO_SECONDS_PER_CREDIT,
      }));
      alert(result.message || 'Credits purchased.');
    } else {
      setAmountError(result.message || 'Error purchasing credits.');
    }
  };

  const endTrial = () => {
    setIsTrialActive(false);
    setIsTrialExpired(true);
  };

  useEffect(() => {
    if (isTrialExpired && onTrialExpired) onTrialExpired();
  }, [isTrialExpired]);

  const calculateCreditsNeeded = (type, amount) => {
    switch (type) {
      case 'text':
        return Math.ceil(amount / CREDIT_RATES.TEXT_WORDS_PER_CREDIT);
      case 'audio':
        return Math.ceil(amount / CREDIT_RATES.AUDIO_SECONDS_PER_CREDIT);
      case 'video':
        return Math.ceil(amount / CREDIT_RATES.VIDEO_SECONDS_PER_CREDIT);
      default:
        return 0;
    }
  };

  const validateAmount = (amount) => {
    if (amount < 100) {
      setAmountError(`Minimum purchase amount is ${currencySymbol}100`);
      return false;
    }
    setAmountError('');
    return true;
  };

  const deductCredits = async (type, amount) => {
    if (isTrialActive) return true;
    const creditsNeeded = calculateCreditsNeeded(type, amount);
    if (userCredits < creditsNeeded) {
      setShowCreditWarning(true);
      return false;
    }
    try {
      // mailerApi auto-unwraps response.data
      const data = await mailerApi.deductCredits({
        userId,
        credits: creditsNeeded,
        type,
        amount,
      });
      if (data) {
        if (data.success) {
          setUserCredits((prevCredits) => {
            const newCredits = prevCredits - creditsNeeded;
            if (onCreditUpdate) onCreditUpdate(newCredits);
            return newCredits;
          });
          setSessionUsage((prev) => ({
            ...prev,
            [`${type}Credits`]: prev[`${type}Credits`] + creditsNeeded,
            totalCredits: prev.totalCredits + creditsNeeded,
          }));
          return true;
        }
      }
    } catch (error) {
      console.error('Failed to deduct credits:', error);
      setShowCreditWarning(true);
      return false;
    }
    return false;
  };

  const handleTextMessage = (wordCount) => {
    if (!isTrialActive) {
      deductCredits('text', wordCount);
    }
    setCurrentUsage((prev) => ({
      ...prev,
      textWords: prev.textWords + wordCount,
    }));
  };

  const handleMediaUsage = (type, seconds) => {
    if (!isTrialActive) {
      deductCredits(type, seconds);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const estimatedTextWords =
    purchaseAmount * CREDIT_RATES.TEXT_WORDS_PER_CREDIT;
  const estimatedAudioSeconds =
    purchaseAmount * CREDIT_RATES.AUDIO_SECONDS_PER_CREDIT;
  const estimatedVideoSeconds =
    purchaseAmount * CREDIT_RATES.VIDEO_SECONDS_PER_CREDIT;

  return (
    <div className="credit-system-container">
      {isTrialActive && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-green-500 to-blue-500 text-white px-6 py-2 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4" />
            <span className="font-medium">
              Free Trial: {formatTime(trialTimeRemaining)}
            </span>
            <div className="w-20 h-2 bg-white/30 rounded-full">
              <div
                className="h-full bg-white rounded-full transition-all duration-1000"
                style={{width: `${(trialTimeRemaining / 60) * 100}%`}}
              />
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed bottom-20 left-4 z-40 bg-gray-900 text-white p-3 rounded-lg shadow-lg max-w-xs cursor-pointer hover:ring-2 hover:ring-blue-300 transition"
        onClick={() => setShowCreditWarning(true)}
        title="Click to view/purchase credits"
      >
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
          <Zap className="w-4 h-4" />
          Session Usage
        </h3>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Text Words:</span>
            <span>{currentUsage.textWords}</span>
          </div>
          <div className="flex justify-between">
            <span>Audio Time:</span>
            <span>{formatTime(currentUsage.audioSeconds)}</span>
          </div>
          <div className="flex justify-between">
            <span>Video Time:</span>
            <span>{formatTime(currentUsage.videoSeconds)}</span>
          </div>
          {!isTrialActive && (
            <>
              <hr className="border-gray-700 my-2" />
              <div className="flex justify-between font-semibold">
                <span>Balance:</span>
                <span>
                  {currencySymbol}
                  {userCredits}
                  {userCredits > 0 && userCredits < 50 && (
                    <AlertTriangle className="w-3 h-3 text-yellow-400 inline ml-1" />
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Credits Used:</span>
                <span>{sessionUsage.totalCredits}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                ≈ {currencySymbol}
                {sessionUsage.totalCredits}
              </div>
            </>
          )}
        </div>
      </div>

      {showCreditWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="text-center">
              {userCredits >= 10 ? (
                <h2 className="text-xl font-bold text-white-900 mb-2">
                  Available Credits: {currencySymbol}
                  {userCredits}
                </h2>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-red-600 mb-2">
                    Insufficient Credits
                  </h2>
                  <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                </>
              )}
              {userCredits >= 10 ? (
                <p className="text-white-700 mb-4">
                  You have enough credits to proceed. Available credits are
                  shown above.
                </p>
              ) : (
                <p className="text-white-600 mb-4">
                  You don't have enough credits for this action. Purchase more
                  credits to continue.
                </p>
              )}

              <div className="mb-4">
                <label
                  htmlFor="creditAmount"
                  className="block text-sm font-medium text-white-700 mb-1"
                >
                  Amount to Purchase ({currencySymbol})
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 pointer-events-none"
                    style={{fontSize: '1rem'}}
                  >
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    id="creditAmount"
                    min="100"
                    value={purchaseAmount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (!isNaN(value)) {
                        setPurchaseAmount(Math.max(100, value));
                        validateAmount(value);
                      } else {
                        setPurchaseAmount(100);
                        validateAmount(100);
                      }
                    }}
                    className="w-full px-8 py-2 text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {amountError && (
                  <p className="text-red-500 text-sm mt-1">{amountError}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Minimum purchase: {currencySymbol}100
                </p>
              </div>

              <div className="bg-green-50 p-4 rounded-lg mb-4">
                <h3 className="font-semibold mb-2 text-green-700">
                  You will get approximately:
                </h3>
                <div className="text-sm text-green-800 space-y-1">
                  <p>Text: {estimatedTextWords.toLocaleString()} words</p>
                  <p>Audio: {formatTime(estimatedAudioSeconds)} minutes</p>
                  <p>Video: {formatTime(estimatedVideoSeconds)} minutes</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <h3 className="font-semibold mb-2 text-gray-400">
                  Credit Rates:
                </h3>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Text (1000 words):</span>
                    <span className="font-semibold text-green-600">
                      {currencySymbol}1
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Audio (60 seconds):</span>
                    <span className="font-semibold text-green-600">
                      {currencySymbol}1
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Video (3 seconds):</span>
                    <span className="font-semibold text-green-600">
                      {currencySymbol}1
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreditWarning(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => buyCredits(purchaseAmount)}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Buy {currencySymbol}
                  {purchaseAmount} Credits
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isTrialExpired && (
        <div className="fixed h-[45em] inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 max-w-md mx-4">
            <div className="text-center">
              <Clock className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h2 className="text-xl font-bold text-white-900 mb-2">
                Free Trial Ended
              </h2>
              <p className="text-white-700 mb-4">
                Your free trial has ended. Purchase credits to continue using
                the service.
              </p>
              <div className="mb-4">
                <label
                  htmlFor="expiredCreditAmount"
                  className="block text-sm font-medium text-white-700 mb-1"
                >
                  Amount to Purchase ({currencySymbol})
                </label>
                <div className="flex items-center">
                  <span className="mr-2 text-white-700">{currencySymbol}</span>
                  <input
                    type="number"
                    id="expiredCreditAmount"
                    min="100"
                    value={purchaseAmount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (!isNaN(value)) {
                        setPurchaseAmount(Math.max(100, value));
                        validateAmount(value);
                      } else {
                        setPurchaseAmount(100);
                        validateAmount(100);
                      }
                    }}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {amountError && (
                  <p className="text-red-500 text-sm mt-1">{amountError}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Minimum purchase: {currencySymbol}100
                </p>
              </div>

              <div className="bg-green-50 p-4 rounded-lg mb-2">
                <h3 className="font-semibold mb-2 text-green-700">
                  You will get approximately:
                </h3>
                <div className="text-sm text-green-800 space-y-1">
                  <p>Text: {estimatedTextWords.toLocaleString()} words</p>
                  <p>Audio: {formatTime(estimatedAudioSeconds)} minutes</p>
                  <p>Video: {formatTime(estimatedVideoSeconds)} minutes</p>
                </div>
              </div>

              <div className="bg-blue-50 p-2 rounded-lg mb-2">
                <h3 className="font-semibold mb-2 flex items-center gap-1 text-gray-600">
                  <Star className="w-4 h-4 text-green-500" />
                  Affordable Pricing:
                </h3>
                <div className="text-sm space-y-1 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">
                      Just {currencySymbol}1 for 1000 words of text
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">
                      Just {currencySymbol}1 for 60 seconds of audio
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">
                      Just {currencySymbol}1 for 3 seconds of video
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <button
                  onClick={() => buyCredits(purchaseAmount)}
                  className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg hover:from-blue-600 hover:to-green-600 transition-all duration-200 font-semibold"
                >
                  Purchase {currencySymbol}
                  {purchaseAmount} Credits
                </button>
                <button
                  onClick={() => setIsTrialExpired(false)}
                  className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditSystem;
