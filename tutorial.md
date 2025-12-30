# Anchor a Merkle Root on HCS for Cost-Effective Verification

## Summary & What You Will Accomplish
- Compute a Merkle root from a batch of off-chain records
- Anchor that Merkle root on HCS with ConsensusSubmitMessage
- Verify the batch (and a single record) later using the mirror node

## Prerequisites
- Node.js installed (v18+)
- A Hedera testnet account + test HBAR (see [Hedera Portal](https://portal.hedera.com) or [Developer Playground](https://hedera.com/playground))
- Basic familiarity with command line

## Table of Contents
1. Setup and Installation
2. Understand the dataset
3. Create a topic for anchors
4. Compute and anchor the Merkle root
5. Verify the batch via Mirror Node
6. Verify a single record (Proof)
7. Notes on message limits

---

## 1. Setup and Installation

### 1a. Clone and Install
Clone the repository and install dependencies:

```bash
git clone https://github.com/hedera-dev/tutorial-hcs-batching-hashing-verification-js.git
cd tutorial-hcs-batching-hashing-verification-js
npm install
```

### 1b. Configure Environment
Copy the example environment file:

```bash
cp .env.example .env
```

Open `.env` and fill in your Testnet credentials:
- `OPERATOR_ID`: Your Account ID (e.g. `0.0.12345`)
- `OPERATOR_KEY`: Your Private Key (e.g. `302e...`)
- `HEDERA_NETWORK`: `testnet`
- `MIRROR_NODE_BASE_URL`: Leave as `https://testnet.mirrornode.hedera.com`

---

## 2. Understand the dataset you will anchor

We have prepared two datasets in `data/`: `batch-10.json` and `batch-100.json`.
Each record looks like this:

```json
{
  "id": "record-000",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "type": "PAYMENT",
  "payload": { "amount": 100, "currency": "HBAR" }
}
```

### Canonicalization
To ensure the hash is deterministic (always the same for the same data), we "canonicalize" the record before hashing. This means:
1. Sorting the object keys alphabetically.
2. Removing all whitespace.
3. Encoding as UTF-8.

This ensures that `{ "a": 1, "b": 2 }` and `{ "b": 2, "a": 1 }` result in the exact same hash.

---

## 3. Create a topic for anchors

Run the setup script to create a new HCS topic:

```bash
node scripts/01-create-topic.js
```

**Expected Output:**
```
✅ Created topic: 0.0.98765

👉 Add this to your .env file:
TOPIC_ID=0.0.98765
```

Copy the new `TOPIC_ID` into your `.env` file.

---

## 4. Compute the Merkle root and anchor it on HCS

Now runs the main script. It will:
1. **Hash** every record in `batch-100.json`.
2. **Compute** the Merkle root (a single hash representing the whole batch).
3. **Submit** an "anchor message" to your HCS topic containing this root.

```bash
node scripts/02-anchor-batch.js --dataset batch-100
```

**Why this saves cost:**
Instead of sending 100 individual transactions (paying fees 100 times), you send **one** transaction with the Merkle root. You still get the security of the public ledger, but at ~1/100th of the cost.

**Expected Output:**
```
--- 2. Anchor Batch Merkle Root ---
...
4) Computed Merkle Root: 1d59720e...
5) Built anchor message (215 bytes).

Submitting to Topic 0.0.98765...

✅ Message Anchored!
   Transaction ID: 0.0.12345@1700000000.000000000
   Merkle Root: 1d59720e...
```

---

## 5. Verify the anchored root using the mirror node

Anyone with access to the Mirror Node (which is free/public) can verify the batch integrity.

```bash
node scripts/03-verify-batch.js --dataset batch-100
```

This script:
1. Re-calculates the root from your local `data/batch-100.json`.
2. Fetches the latest message from the Mirror Node.
3. Compares the two roots.

**Output:**
```
...
2) Fetching latest anchor from Topic 0.0.98765...
   Anchored Merkle root:       1d59720e...

--- VERIFICATION ---
✅ PASS: Mirror node root matches local dataset root.
```

---

## 6. Verify a single record using a Merkle proof

A powerful feature of Merkle trees is proving *one* item is in the batch without revealing the others. We have pre-generated proofs in `data/proofs-100.json`.

```bash
node scripts/04-verify-single-record.js --dataset batch-100 --recordId record-042
```

The script takes the single record's hash and combines it with "siblings" from the proof until it reaches the root. If the calculated root matches the trusted root, the record is proven content.

**Output:**
```
✅ PASS: Record "record-042" is cryptographically proven to be in the batch.
```

---

## 7. Notes on message size limits and chunking

### Message Limits
- **HCS Message Size:** 1024 bytes (1 KB).
- **HCS Transaction Size:** 6 KB (includes signatures and keys).

### Chunking
If your anchor message exceeds 1 KB (e.g., if you added a lot of metadata), you must use **HCS Chunking**.
The SDK handles this automatically if you configure it:

```javascript
new TopicMessageSubmitTransaction()
    .setMessage(largeContent)
    .setMaxChunks(20) // Default is 20
    .execute(client);
```

For this tutorial, our anchor message is ~200 bytes, so no chunking was needed.

### Terminology: Batch Hash vs. Merkle Root
- **Batch Hash**: Usually `hash(record1 + record2 + ...)`. Hard to verify just one record.
- **Merkle Root**: `hash(hash(r1) + hash(r2))`. Allows efficient single-record proofs. We use Merkle Roots here for flexibility.

---

## Code Check ✅

If you run into issues, compare your files to the full reference code below.

{% tabs %}
{% tab title="scripts/01-create-topic.js" %}
```javascript
const { createTopic } = require('../src/hedera');

async function main() {
  console.log('--- 1. Create HCS Topic ---');
  
  if (!process.env.OPERATOR_ID || !process.env.OPERATOR_KEY) {
    console.error('Error: OPERATOR_ID or OPERATOR_KEY missing in .env');
    process.exit(1);
  }

  try {
    const topicId = await createTopic();
    console.log(`\n✅ Created topic: ${topicId}`);
    console.log(`\n👉 Add this to your .env file:\nTOPIC_ID=${topicId}`);
  } catch (err) {
    console.error('Error creating topic:', err.message);
    process.exit(1);
  }
}

main();
```
{% endtab %}

{% tab title="scripts/02-anchor-batch.js" %}
```javascript
const fs = require('fs');
const path = require('path');
const { canonicalize } = require('../src/canonicalize');
const { sha256 } = require('../src/hash');
const { computeRoot } = require('../src/merkle');
const { createAnchorMessage } = require('../src/anchor-message');
const { submitMessage } = require('../src/hedera');

const args = process.argv.slice(2);
const datasetArg = args.find(arg => arg.startsWith('--dataset'));
const datasetName = datasetArg ? datasetArg.split('=')[1] : 'batch-10'; // default

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
```
{% endtab %}

{% tab title="scripts/03-verify-batch.js" %}
```javascript
const fs = require('fs');
const path = require('path');
const { canonicalize } = require('../src/canonicalize');
const { sha256 } = require('../src/hash');
const { computeRoot } = require('../src/merkle');
const { getLatestTopicMessage } = require('../src/mirror-node');

const args = process.argv.slice(2);
const datasetArg = args.find(arg => arg.startsWith('--dataset'));
const datasetName = datasetArg ? datasetArg.split('=')[1] : 'batch-10';

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
```
{% endtab %}

{% tab title="scripts/04-verify-single-record.js" %}
```javascript
const fs = require('fs');
const path = require('path');
const { verifyProof } = require('../src/merkle');

const args = process.argv.slice(2);

// Parse args roughly
let datasetName = 'batch-10';
let recordId = 'record-005'; // default

args.forEach(arg => {
  if (arg.startsWith('--dataset=')) datasetName = arg.split('=')[1];
  if (arg.startsWith('--recordId=')) recordId = arg.split('=')[1];
});

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
```
{% endtab %}

{% tab title="src/merkle.js" %}
```javascript
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
```
{% endtab %}

{% tab title="src/canonicalize.js" %}
```javascript
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
```
{% endtab %}

{% tab title="src/hedera.js" %}
```javascript
const {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PrivateKey
} = require("@hiero-ledger/sdk");

const { OPERATOR_ID, OPERATOR_KEY, HEDERA_NETWORK } = require("./config");

function getClient() {
  if (!OPERATOR_ID || !OPERATOR_KEY) {
    throw new Error("OPERATOR_ID and OPERATOR_KEY must be set in .env");
  }

  const client = Client.forName(HEDERA_NETWORK);
  client.setOperator(OPERATOR_ID, PrivateKey.fromString(OPERATOR_KEY));
  return client;
}

/**
 * Creates a new HCS topic.
 * @returns {Promise<string>} The new Topic ID (e.g. "0.0.12345")
 */
async function createTopic() {
  const client = getClient();
  
  const tx = await new TopicCreateTransaction()
    .setTopicMemo("Merkle Anchor Verification Tutorial")
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId.toString();
  
  client.close();
  return topicId;
}

/**
 * Submits a message to an HCS topic.
 * @param {string} topicId 
 * @param {string} messageString 
 * @returns {Promise<{status: string, transactionId: string}>}
 */
async function submitMessage(topicId, messageString) {
  const client = getClient();
  
  // Note: For larger messages, SDK handles chunking if enabled.
  // .setMaxChunks(20) and .setChunkSize(1024) are defaults or can be set manually.
  // In this tutorial, our anchor is small (<1KB), so no chunking needed.
  
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(messageString)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const status = receipt.status.toString();
  const transactionId = tx.transactionId.toString();
  
  client.close();
  return { status, transactionId };
}

module.exports = {
  createTopic,
  submitMessage
};
```
{% endtab %}

{% tab title="src/mirror-node.js" %}
```javascript
const { MIRROR_NODE_BASE_URL } = require("./config");

/**
 * Fetches the latest message for a given topic from the Mirror Node.
 * @param {string} topicId 
 * @returns {Promise<Object>} The message content and metadata
 */
async function getLatestTopicMessage(topicId) {
  const url = `${MIRROR_NODE_BASE_URL}/api/v1/topics/${topicId}/messages?limit=1&order=desc`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mirror node error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.messages || data.messages.length === 0) {
      throw new Error("No messages found for this topic");
    }
    
    const latest = data.messages[0];
    
    // Decode base64 message
    // Note: older mirror node versions might return hex; standard is base64
    const messageContent = Buffer.from(latest.message, 'base64').toString('utf8');
    
    return {
      sequenceNumber: latest.sequence_number,
      consensusTimestamp: latest.consensus_timestamp,
      message: messageContent
    };
  } catch (error) {
    console.error("Error fetching from mirror node:", error.message);
    throw error;
  }
}

module.exports = {
  getLatestTopicMessage
};
```
{% endtab %}

{% tab title="src/anchor-message.js" %}
```javascript
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
```
{% endtab %}

{% tab title="src/config.js" %}
```javascript
const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function checkEnv(key) {
  const val = process.env[key];
  if (!val) {
    console.warn(`[WARN] Missing ${key} in .env`);
  }
  return val;
}

module.exports = {
  HEDERA_NETWORK: process.env.HEDERA_NETWORK || 'testnet',
  OPERATOR_ID: checkEnv('OPERATOR_ID'),
  OPERATOR_KEY: checkEnv('OPERATOR_KEY'),
  TOPIC_ID: process.env.TOPIC_ID, // Optional, might be created by script
  MIRROR_NODE_BASE_URL: process.env.MIRROR_NODE_BASE_URL || 'https://testnet.mirrornode.hedera.com'
};
```
{% endtab %}
{% endtabs %}

Repository: [tutorial-hcs-batching-hashing-verification-js](https://github.com/hedera-dev/tutorial-hcs-batching-hashing-verification-js)

### Next steps
- **[Hedera Developer Playground](https://hedera.com/playground)**: Try sending messages and creating topics in the browser.
- **[GitHub Repo](https://github.com/hedera-dev/tutorial-hcs-batching-hashing-verification-js)**: Explore the full source code and data generation scripts.
- **Next Tutorial**: [Query Messages with Mirror Node](https://docs.hedera.com/hedera/tutorials/consensus/query-messages-with-mirror-node) - Learn how to filter and retrieve specific messages like an audit log.
