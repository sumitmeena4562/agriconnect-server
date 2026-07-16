const crypto = require('crypto');

// Derive 32-byte key from JWT_SECRET or fallback
const getEncryptionKey = () => {
    const secret = process.env.JWT_SECRET || 'agriconnect_default_secret_key_12345';
    return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypts a plain-text OTP string using AES-256-CBC
 * @param {string} plainText 
 * @returns {string} cipherText formatted as ivHex:encryptedHex
 */
const encryptOTP = (plainText) => {
    if (!plainText) return plainText;
    // If already looks encrypted, return it
    if (plainText.includes(':')) return plainText;

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypts an encrypted OTP string back to plain-text
 * @param {string} cipherText 
 * @returns {string} plain-text OTP
 */
const decryptOTP = (cipherText) => {
    if (!cipherText) return cipherText;
    try {
        if (!cipherText.includes(':')) return cipherText; // fallback for legacy plain text OTPs
        const [ivHex, encryptedHex] = cipherText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('Decryption failed, returning raw string:', err.message);
        return cipherText; // safe fallback
    }
};

module.exports = {
    encryptOTP,
    decryptOTP
};
