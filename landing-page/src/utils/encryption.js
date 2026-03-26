/**
 * encryption.js — Centralized CryptoJS encrypt/decrypt.
 * Replaces duplicated SECRET_KEY + decryptValue() across 5 files.
 */

import {ENCRYPTION_KEY} from '../config/apiBase';

import CryptoJS from 'crypto-js';

const SECRET_KEY = ENCRYPTION_KEY;

export function decrypt(encryptedValue) {
  if (!encryptedValue || !SECRET_KEY) return null;
  try {
    return CryptoJS.AES.decrypt(encryptedValue, SECRET_KEY).toString(
      CryptoJS.enc.Utf8
    );
  } catch {
    return null;
  }
}

export function encrypt(value) {
  if (value == null || !SECRET_KEY) return null;
  return CryptoJS.AES.encrypt(String(value), SECRET_KEY).toString();
}
