/**
 * Formats the anchor message for HCS.
 * @param {string} merkleRootHex 
 * @param {string} datasetName 
 * @param {number} recordCount 
 * @returns {Object} JSON object ready to be stringified
 */
function createAnchorMessage(merkleRootHex, datasetName, recordCount) {
    return {
        schema: "hcs.merkleRootAnchor",
        schemaVersion: "1",
        datasetVersion: "v1",
        batchFile: `data/${datasetName}.json`,
        recordCount: recordCount,
        hashAlg: "sha256",
        merkleRoot: merkleRootHex,
        createdAt: new Date().toISOString()
    };
}

module.exports = {
    createAnchorMessage
};
