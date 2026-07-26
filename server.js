// Wrapper to run the identity-wallet server from the root directory
const path = require('path');

// Change working directory to 'identity-wallet' so dotenv and static paths resolve correctly
process.chdir(path.join(__dirname, 'identity-wallet'));

// Require server.js relative to the new working directory
require('./server.js');