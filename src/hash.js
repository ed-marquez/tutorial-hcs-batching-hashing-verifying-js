const crypto = require('node:crypto');

/**
 * Computes SHA-256 hash of a buffer or string.
 * @param {Buffer|string} data 
 * @returns {Buffer} Raw buffer of the hash
 */
function sha256(data) {
    return crypto.createHash('sha256').update(data).digest();
}

/**
 * Computes SHA-256 and returns hex string.
 * @param {Buffer|string} data
 * @returns {string} Hex string
 */
function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = {
    sha256,
    sha256Hex
};
