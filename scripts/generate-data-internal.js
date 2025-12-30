const fs = require('fs');
const path = require('path');
const { canonicalize } = require('../src/canonicalize');
const { sha256Hex, sha256 } = require('../src/hash');
const { computeRoot, getProof } = require('../src/merkle');

const DATA_DIR = path.join(__dirname, '../data');

function generateBatch(count) {
    const batch = [];
    for (let i = 0; i < count; i++) {
        const id = `record-${String(i).padStart(3, '0')}`;
        batch.push({
            id,
            timestamp: new Date('2025-01-01T12:00:00Z').toISOString(), // Fixed time for determinism
            type: 'PAYMENT',
            payload: {
                amount: (i + 1) * 100,
                currency: 'HBAR',
                memo: `Transaction ${i}`
            }
        });
    }
    return batch;
}

function processBatch(batchName, batch) {
    // 1. Calculate leaves
    const leaves = batch.map(record => {
        const bytes = canonicalize(record);
        return sha256(bytes);
    });

    // 2. Compute root
    const rootBuffer = computeRoot(leaves);
    const rootHex = rootBuffer.toString('hex');

    // 3. Generate proofs
    const proofs = {};
    batch.forEach((record, index) => {
        const proof = getProof(leaves, index);
        proofs[record.id] = {
            leafHashHex: sha256Hex(canonicalize(record)),
            proof
        };
    });

    // Write files
    fs.writeFileSync(path.join(DATA_DIR, `${batchName}.json`), JSON.stringify(batch, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, `proofs-${batch.length}.json`), JSON.stringify(proofs, null, 2));

    return rootHex;
}

function main() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }

    const batch10 = generateBatch(10);
    const root10 = processBatch('batch-10', batch10);

    const batch100 = generateBatch(100);
    const root100 = processBatch('batch-100', batch100);

    const manifest = {
        datasetVersion: "v1",
        hashAlgorithm: "sha256",
        canonicalization: "Recursive key sort, no whitespace, UTF-8. Arrays preserve order.",
        merkleTreeRule: "SHA-256(left || right). Odd nodes duplicate last. Raw bytes concatenation.",
        expectedMerkleRoot_batch10: root10,
        expectedMerkleRoot_batch100: root100
    };

    fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log('Data generation complete.');
    console.log('Batch 10 Root:', root10);
    console.log('Batch 100 Root:', root100);
}

main();
