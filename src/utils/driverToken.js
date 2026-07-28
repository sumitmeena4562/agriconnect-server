const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'agriconnect_driver_sec_key_2026';

/**
 * Generates a signed token for driver link verification
 */
const generateDriverToken = (driverId) => {
    const hmac = crypto.createHmac('sha256', SECRET).update(String(driverId)).digest('hex').substring(0, 16);
    return `${driverId}.${hmac}`;
};

/**
 * Verifies a signed driver token and returns the driverId if valid
 */
const verifyDriverToken = (tokenStr) => {
    if (!tokenStr || typeof tokenStr !== 'string' || !tokenStr.includes('.')) {
        return null;
    }
    const [driverId, hmac] = tokenStr.split('.');
    if (!driverId || !hmac) return null;

    const expectedHmac = crypto.createHmac('sha256', SECRET).update(String(driverId)).digest('hex').substring(0, 16);
    try {
        if (crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
            return driverId;
        }
    } catch (e) {
        return null;
    }
    return null;
};

module.exports = {
    generateDriverToken,
    verifyDriverToken
};
