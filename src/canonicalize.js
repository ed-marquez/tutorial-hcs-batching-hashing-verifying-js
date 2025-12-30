/**
 * Canonicalizes a JavaScript object (conceptually similar to JCS).
 * - Sorts keys recursively
 * - Encodes as UTF-8 (via Buffer.from)
 * - Result is a Buffer ready for hashing
 * 
 * @param {Object} record - The object to canonicalize
 * @returns {Buffer} - The canonical byte array
 */
function canonicalize(record) {
    // 1. Deterministic stringify (sort keys)
    const jsonString = JSON.stringify(record, (key, value) => {
        // If value is a plain object and not an array, sort its keys
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value)
                .sort()
                .reduce((sorted, k) => {
                    sorted[k] = value[k];
                    return sorted;
                }, {});
        }
        return value;
    });

    // 2. Return buffer (UTF-8)
    return Buffer.from(jsonString, 'utf8');
}

module.exports = {
    canonicalize
};
