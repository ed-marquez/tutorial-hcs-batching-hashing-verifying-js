const fs = require('fs');
const path = require('path');
const { canonicalize } = require('../src/canonicalize');
const { sha256 } = require('../src/hash');
const { computeRoot } = require('../src/merkle');
const { createAnchorMessage } = require('../src/anchor-message');
const { submitMessage } = require('../src/hedera');

const args = process.argv.slice(2);
let datasetName = 'batch-10'; // default

for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--dataset=')) {
        datasetName = args[i].split('=')[1];
    } else if (args[i] === '--dataset' && i + 1 < args.length) {
        datasetName = args[i + 1];
        i++; // skip the value
    }
}

async function main() {
    console.log('--- 2. Anchor Batch Merkle Root ---');
    console.log(`Using dataset: ${datasetName}`);

    const startTime = Date.now();

    // 1. Load Dataset
    const filePath = path.join(__dirname, `../data/${datasetName}.json`);
    if (!fs.existsSync(filePath)) {
        console.error(`Error: Dataset not found at ${filePath}`);
        process.exit(1);
    }
    const batch = JSON.parse(fs.readFileSync(filePath));
    console.log(`1) Loaded ${batch.length} records.`);

    // 2. Canonicalize & 3. Hash Leaves
    const leaves = batch.map(record => sha256(canonicalize(record)));
    console.log('2, 3) Canonicalized and computed leaf hashes.');

    // 4. Compute Root
    const rootBuffer = computeRoot(leaves);
    const rootHex = rootBuffer.toString('hex');
    console.log(`4) Computed Merkle Root: ${rootHex}`);

    // 5. Build Anchor Message
    const anchorMessage = createAnchorMessage(rootHex, datasetName, batch.length);
    const messageString = JSON.stringify(anchorMessage);
    console.log(`5) Built anchor message (${messageString.length} bytes).`);

    if (messageString.length > 1024) {
        console.warn('⚠️  Warning: Message size > 1024 bytes. HCS chunking would be required for standard messages.');
    }

    // 6. Submit to HCS
    const topicId = process.env.TOPIC_ID;
    if (!topicId) {
        console.error('Error: TOPIC_ID missing in .env');
        process.exit(1);
    }

    console.log(`\nSubmitting to Topic ${topicId}...`);
    try {
        const { status, transactionId } = await submitMessage(topicId, messageString);
        console.log(`\n✅ Message Anchored!`);
        console.log(`   Transaction ID: ${transactionId}`);
        console.log(`   HashScan: https://hashscan.io/testnet/transaction/${transactionId}`);
        console.log(`   Status: ${status}`);
        console.log(`   Merkle Root: ${rootHex}`);

        // Warn about latency
        console.log('\nNote: Wait 5-10 seconds before verifying with mirror node to allow propagation.');
    } catch (err) {
        console.error('Error submitting message:', err);
        process.exit(1);
    }
}

main();
