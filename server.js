// Wrapper to run the identity-wallet server from the root directory
const path = require('path');

// Change the current working directory to the identity-wallet directory so that
// dotenv, express.static, and relative file paths resolve correctly.
process.chdir(path.join(__dirname, 'identity-wallet'));

// Require the actual server. Node will resolve all dependencies (express, cors, mongoose, etc.)
// from the identity-wallet/node_modules folder relative to the server.js location.
require('./identity-wallet/server.js');
