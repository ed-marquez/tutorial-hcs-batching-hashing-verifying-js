# Batch, anchor, and verify records with HCS

Follow this tutorial in the official Hedera Documentation: 
## 🔗 [Batch, anchor, and verify records with HCS](https://docs.hedera.com/hedera/tutorials/consensus/batch-anchor-verify-records-with-hcs)

Learn how to batch records off-chain, compute a Merkle root, and anchor it on Hedera Consensus Service for cost-effective verification.

The Hedera Consensus Service (HCS) enables decentralized event ordering and immutable timestamping for any application. A best practice for data integrity involves anchoring a 'digital fingerprint' of your records on-chain, which provides a verifiable audit trail without exposing sensitive information. Merkle roots are cryptographic summaries that enable the efficient verification of large datasets, allowing you to also prove the existence of individual records within a batch. This tutorial demonstrates how to use these tools to verify data on a public ledger like Hedera in a manner that is both highly secure and cost-effective.

## What You Will Accomplish
- Compute a Merkle root from a batch of off-chain records
- Anchor that Merkle root on HCS using `ConsensusSubmitMessage`
- Verify the batch (and a single record) using the mirror node

## Prerequisites
- Node.js
- A Hedera testnet account (see [Hedera Portal](https://portal.hedera.com))

## Table of Contents
1. Setup and Installation
2. Understand the dataset
3. Create a topic for batch anchoring and verification
4. Compute the Merkle root
5. Anchor the Merkle root on HCS
6. Verify the batch via Mirror Node
7. Verify a single record (Proof)
8. Next steps

---

## 1. Setup and Installation

### 1a. Clone and Install
Clone the repository and install dependencies:

```bash
git clone https://github.com/hedera-dev/tutorial-hcs-batching-hashing-verifying-js.git
cd tutorial-hcs-batching-hashing-verifying-js
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

There are two datasets available in `data/`: `batch-10.json` and `batch-100.json`.
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

<Info>
  Canonicalization is the process of converting data into a standard, unique format. It is essential because different representations of the same logical data (like different key orders or whitespace) would produce different hashes, making verification difficult.
</Info>

### Terminology: Batch Hash vs. Merkle Root
- **Batch Hash**: Usually `hash(record1 + record2 + ...)`. This approach is simple, but makes it hard to verify any single record.
- **Merkle Root**: `hash(hash(r1) + hash(r2) + ...)`. This approach allows efficient batch verification and single-record proofs. This example uses Merkle Roots.

---

## 3. Create a topic for batch anchoring and verification

Run the setup script to create a new HCS topic:

```bash
node scripts/01-create-topic.js
```

**Expected Output:**
```
✅ Created topic: 0.0.98765
   Transaction ID: 0.0.1307@1767056727.814369284
   HashScan: https://hashscan.io/testnet/transaction/0.0.1307@1767056727.814369284

👉 Add this to your .env file:
TOPIC_ID=0.0.98765
```

🚨 Copy the new `TOPIC_ID` into your `.env` file.

---

## 4. Compute the Merkle root (Local)

Before anchoring on-chain, calculate the Merkle root locally for the dataset you want to anchor. This example uses the dataset in `data/batch-100.json`. Run `scripts/02-compute-root.js` as shown below:

```bash
node scripts/02-compute-root.js --dataset batch-100
```

This script performs the following process:
1.  **Load Dataset**: Reads the JSON file from the `data/` directory.
2.  **Canonicalize**: Standardizes each record to ensure a deterministic hash.
3.  **Hash**: Computes the SHA-256 hash of each canonicalized record (the leaves of the tree).
4.  **Compute Root**: Recursively pairs and hashes leaves using `computeRoot` until a single root hash remains.


**Expected Output:**
```
--- 2. Compute Merkle Root (Local) ---
Using dataset: batch-100
1) Loaded 100 records.
2, 3) Canonicalized and computed leaf hashes.
4) Computed Merkle Root: 1d59720e...

Success! You can now anchor this root on HCS in the next step.
```

---

## 5. Anchor the Merkle root on HCS

Now that you have the root hash, proceed to anchor it on Hedera. This step recomputes the root for safety and then submits a message to HCS.

While you could manually use the root hash from the previous step, recomputing it immediately before submission is a best practice. This ensures the anchor reflects the current state of your local dataset and serves as a final integrity check before committing the hash to the public ledger.

```bash
node scripts/03-submit-anchor.js --dataset batch-100
```


**Expected Output:**
```
--- 3. Anchor Batch Merkle Root on HCS ---
...
1) Recomputed local Merkle Root: 1d59720e...
2) Built anchor message (215 bytes).

Submitting to Topic 0.0.98765...

✅ Message Anchored!
   Transaction ID: 0.0.1307@1767056727.814369284
   HashScan: https://hashscan.io/testnet/transaction/0.0.1307@1767056727.814369284
   Status: SUCCESS
   Merkle Root: 1d59720e...
```
This approach is efficient because instead of sending 100 individual transactions, you send **one** transaction with the Merkle root.

---

## 6. Verify the anchored root using the mirror node

With the Merkle root hash on the public ledger, anyone can verify the batch integrity. Running `scripts/04-verify-batch.js` confirms this by completing the following steps:
  1.  **Recompute Root**: Loads the local dataset and calculates the Merkle root from your local `data/batch-100.json` exactly as before using `computeRoot`.
  2.  **Fetch Message**: Queries the [Mirror Node REST API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api) for the latest message on the topic using `getLatestTopicMessage`.
  3.  **Compare**: decoding the message and verifying that the on-chain root matches the locally computed root.

<Info>
  Hedera operates a free/public mirror node for testing and development. Production applications should use commercial-grade mirror node services provided by [third-party vendors](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#hedera-mirror-node-environments).
</Info>

```bash
node scripts/04-verify-batch.js --dataset batch-100
```


**Output:**
```
...
2) Fetching latest anchor from Topic 0.0.98765...
   Anchored Merkle root:       1d59720e...

--- VERIFICATION ---
✅ PASS: Mirror node root matches local dataset root.
```

---

## 7. Verify a single record using a Merkle proof

A powerful feature of Merkle trees is that they enable proving *one* item is in the batch without revealing the other items. 

For simplicity, in this tutorial we use pre-generated proofs in `data/proofs-100.json`. The script takes the single record's hash and combines it with "siblings" from the pre-generated proof until it reaches the root. If the calculated root matches the trusted root, the record is proven content.

Running `scripts/05-verify-single-record.js` demonstrates Merkle proofs with the following steps:
  1.  **Load Proof**: Reads the pre-generated Merkle proof for the specific record.
  2.  **Trusted Root**: In a real scenario, this comes from HCS (as in step 6). Here we simulate it with a manifest (`data/manifest.json`).
  3.  **Verify**: Use the `verifyProof` function to hash the record with its sibling hashes up the tree. If the final hash matches the trusted root, the record is proven.

```bash
node scripts/05-verify-single-record.js --dataset batch-100 --recordId record-042
```


**Output:**
```
✅ PASS: Record "record-042" is cryptographically proven to be in the batch.
```

---

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

---

## Next steps
- **[Hedera Developer Playground](https://portal.hedera.com/playground)**: Try sending messages and creating topics in the browser.
- **[GitHub Repo](https://github.com/hedera-dev/tutorial-hcs-batching-hashing-verifying-js)**: Explore the full source code and data generation scripts.
- **Next Tutorial**: [Query Messages with Mirror Node](https://docs.hedera.com/hedera/tutorials/consensus/query-messages-with-mirror-node) - Learn how to filter and retrieve specific messages like an audit log.
