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
