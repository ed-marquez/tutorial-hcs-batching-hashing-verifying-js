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
