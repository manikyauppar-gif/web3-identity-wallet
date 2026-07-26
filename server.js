// 1. If it's a pure API server, add a landing health-check route:
app.get('/', (req, res) => {
  res.send('🚀 Web3 Identity Wallet API is Live and Running!');
});

// OR 2. If you have frontend HTML files in a folder (e.g., 'public'):
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));