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
    client.setOperator(OPERATOR_ID, PrivateKey.fromStringECDSA(OPERATOR_KEY));
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
    const transactionId = tx.transactionId.toString();

    client.close();
    return { topicId, transactionId };
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
