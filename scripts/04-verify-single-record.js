const fs = require('fs');
const path = require('path');
const { verifyProof } = require('../src/merkle');

const args = process.argv.slice(2);

// Parse args roughly
let datasetName = 'batch-10';
let recordId = 'record-005'; // default

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--dataset=')) {
        datasetName = arg.split('=')[1];
    } else if (arg === '--dataset' && i + 1 < args.length) {
        datasetName = args[i + 1];
        i++;
    } else if (arg.startsWith('--recordId=')) {
        recordId = arg.split('=')[1];
    } else if (arg === '--recordId' && i + 1 < args.length) {
        recordId = args[i + 1];
        i++;
    }
}

async function main() {
    console.log('--- 4. Verify Single Record (Merkle Integrity) ---');
    console.log(`Dataset: ${datasetName}`);
    console.log(`Record ID: ${recordId}`);

    // 1. Load Manifest (Trusted Source needed for Root)
    // In a real app, you'd get the root from the chain (like script 03), 
    // but here we simulate having the "Trusted Root" from the mirror node.
    const manifestPath = path.join(__dirname, '../data/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath));

    // Decide which root to use
    let trustedRoot = '';
    if (datasetName === 'batch-10') trustedRoot = manifest.expectedMerkleRoot_batch10;
    else if (datasetName === 'batch-100') trustedRoot = manifest.expectedMerkleRoot_batch100;

    if (!trustedRoot) {
        console.error('Unknown dataset root in manifest.');
        process.exit(1);
    }

    console.log(`Expected Root (from trusted source): ${trustedRoot}`);

    // 2. Load Proof for the Record
    const proofsPath = path.join(__dirname, `../data/proofs-${datasetName.split('-')[1]}.json`);
    if (!fs.existsSync(proofsPath)) {
        console.error('Proofs file not found.');
        process.exit(1);
    }
    const allProofs = JSON.parse(fs.readFileSync(proofsPath));

    const recordProofData = allProofs[recordId];
    if (!recordProofData) {
        console.error(`No proof found for record ${recordId}`);
        process.exit(1);
    }

    const { leafHashHex, proof } = recordProofData;

    // 3. Verify
    const isValid = verifyProof(leafHashHex, trustedRoot, proof);

    console.log('\n--- VERIFICATION ---');
    if (isValid) {
        console.log(`✅ PASS: Record "${recordId}" is cryptographically proven to be in the batch.`);
        console.log('   The Merkle proof reconstructs the root exactly.');
    } else {
        console.error(`❌ FAIL: Proof invalid for record "${recordId}".`);
    }
}

main();
