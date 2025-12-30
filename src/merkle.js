const { sha256 } = require('./hash');

/**
 * Computes the Merkle root of an array of buffers (leaves).
 * Rules:
 * - SHA-256(left || right)
 * - If odd, duplicate last node
 * 
 * @param {Buffer[]} leafHashes 
 * @returns {Buffer} Root hash buffer
 */
function computeRoot(leafHashes) {
    if (leafHashes.length === 0) return Buffer.alloc(0);
    if (leafHashes.length === 1) return leafHashes[0];

    const nextLevel = [];

    for (let i = 0; i < leafHashes.length; i += 2) {
        const left = leafHashes[i];
        // If we're at the end and it's odd, duplicate the last one
        const right = (i + 1 < leafHashes.length) ? leafHashes[i + 1] : left;

        // Concatenate raw bytes
        const combined = Buffer.concat([left, right]);
        nextLevel.push(sha256(combined));
    }

    return computeRoot(nextLevel);
}

/**
 * Generates a Merkle proof for a specific leaf index.
 * @param {Buffer[]} leafHashes 
 * @param {number} index 
 * @returns {Array<{sibling: string, position: 'left'|'right'}>} Proof path
 */
function getProof(leafHashes, index) {
    const proof = [];
    let currentLevel = [...leafHashes];
    let currIndex = index;

    while (currentLevel.length > 1) {
        const nextLevel = [];

        // Process pairs
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : left;

            // Determine sibling for the current tracking index
            // If we are part of this pair...
            if (Math.floor(currIndex / 2) === i / 2) {
                if (currIndex % 2 === 0) {
                    // We are left, sibling is right
                    proof.push({
                        siblingHashHex: right.toString('hex'),
                        position: 'right'
                    });
                } else {
                    // We are right, sibling is left
                    proof.push({
                        siblingHashHex: left.toString('hex'),
                        position: 'left'
                    });
                }
            }

            const combined = Buffer.concat([left, right]);
            nextLevel.push(sha256(combined));
        }

        currentLevel = nextLevel;
        currIndex = Math.floor(currIndex / 2);
    }

    return proof;
}

/**
 * Verifies a Merkle proof.
 * @param {string} leafHashHex 
 * @param {string} rootHashHex 
 * @param {Array} proof 
 * @returns {boolean}
 */
function verifyProof(leafHashHex, rootHashHex, proof) {
    let currentHash = Buffer.from(leafHashHex, 'hex');

    for (const step of proof) {
        const siblingParams = Buffer.from(step.siblingHashHex, 'hex');

        if (step.position === 'right') {
            currentHash = sha256(Buffer.concat([currentHash, siblingParams]));
        } else {
            currentHash = sha256(Buffer.concat([siblingParams, currentHash]));
        }
    }

    return currentHash.toString('hex') === rootHashHex;
}

module.exports = {
    computeRoot,
    getProof,
    verifyProof
};
