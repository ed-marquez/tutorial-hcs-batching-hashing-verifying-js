const fs = require('fs');
const path = require('path');
const { canonicalize } = require('../src/canonicalize');
const { sha256 } = require('../src/hash');
const { computeRoot } = require('../src/merkle');
const { getLatestTopicMessage } = require('../src/mirror-node');

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
    console.log('--- 3. Verify Batch from Mirror Node ---');
    console.log(`Using dataset: ${datasetName} (Local)`);

    const topicId = process.env.TOPIC_ID;
    if (!topicId) {
        console.error('Error: TOPIC_ID missing in .env');
        process.exit(1);
    }

    // 1. Recompute Local Root
    const filePath = path.join(__dirname, `../data/${datasetName}.json`);
    if (!fs.existsSync(filePath)) {
        console.error(`Error: Dataset not found at ${filePath}`);
        process.exit(1);
    }
    const batch = JSON.parse(fs.readFileSync(filePath));
    const leaves = batch.map(record => sha256(canonicalize(record)));
    const computedRoot = computeRoot(leaves).toString('hex');

    console.log(`1) Computed local Merkle root:   ${computedRoot}`);

    // 2. Fetch from Mirror Node
    console.log(`2) Fetching latest anchor from Topic ${topicId}...`);
    try {
        const { message, sequenceNumber, consensusTimestamp } = await getLatestTopicMessage(topicId);
        console.log(`   Fetched Sequence #${sequenceNumber} (${consensusTimestamp})`);

        // 3. Decode & Parse
        let anchor;
        try {
            anchor = JSON.parse(message);
        } catch (e) {
            console.error('Error parsing message JSON:', message);
            process.exit(1);
        }

        if (anchor.schema !== 'hcs.merkleRootAnchor') {
            console.warn('⚠️  Message is not an hcs.merkleRootAnchor schema. Retrying/Searching not implemented in tutorial.');
            process.exit(1);
        }

        const anchoredRoot = anchor.merkleRoot;
        console.log(`   Anchored Merkle root:       ${anchoredRoot}`);

        // 4. Compare
        console.log('\n--- VERIFICATION ---');
        if (computedRoot === anchoredRoot) {
            console.log('✅ PASS: Mirror node root matches local dataset root.');
        } else {
            console.error('❌ FAIL: Roots do not match!');
            console.error(`Expected (Local):    ${computedRoot}`);
            console.error(`Actual (On-Chain):   ${anchoredRoot}`);
            process.exit(1);
        }

    } catch (err) {
        console.error('Error verifying batch:', err.message);
        process.exit(1);
    }
}

main();
