const { createTopic } = require('../src/hedera');

async function main() {
    console.log('--- 1. Create HCS Topic ---');

    if (!process.env.OPERATOR_ID || !process.env.OPERATOR_KEY) {
        console.error('Error: OPERATOR_ID or OPERATOR_KEY missing in .env');
        process.exit(1);
    }

    try {
        const { topicId, transactionId } = await createTopic();
        console.log(`\n✅ Created topic: ${topicId}`);
        console.log(`   Transaction ID: ${transactionId}`);
        console.log(`   HashScan: https://hashscan.io/testnet/transaction/${transactionId}`);
        console.log(`\n👉 Add this to your .env file:\nTOPIC_ID=${topicId}`);
    } catch (err) {
        console.error('Error creating topic:', err.message);
        process.exit(1);
    }
}

main();
