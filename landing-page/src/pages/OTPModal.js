import {logger} from '../utils/logger';

import {X} from 'lucide-react';
import React from 'react';

export default function OTPModal({isOpen, onClose, otp, setOtp, onVerify}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative w-full max-w-md bg-white rounded-lg p-6 mx-4">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
        >
          <X size={24} />
        </button>

        <h3 className="text-xl font-semibold mb-6 text-center">Enter OTP</h3>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Verification Code
          </label>
          <input
            type="text"
            value={otp}
            onChange={(e) => {
              logger.log(e.target.value);
              setOtp(e.target.value);
            }}
            className="w-full px-4 text-black py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter OTP"
            maxLength={6}
          />
        </div>

        <button
          onClick={onVerify}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md"
        >
          Verify OTP
        </button>
      </div>
    </div>
  );
}
