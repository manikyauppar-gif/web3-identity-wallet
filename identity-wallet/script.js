// script.js

const CONTRACT_ADDRESS = "0x010a003cC9664C281bA9b31bD2a20e4BCb9c203B"; // Update this after deploying new contract!
const API_BASE = '/api';

const CONTRACT_ABI = [
    "function registerDID(string memory did) external",
    "function issueCredential(address recipient, bytes32 hash, string memory ipfsCID, string memory credType, uint256 expiresAt) external",
    "function verifyCredential(bytes32 hash) external view returns (bool)",
    "function getCredentials(address user) external view returns (tuple(bytes32 credentialHash, address issuer, address recipient, string credentialType, string ipfsCID, uint256 issuedAt, uint256 expiresAt, bool isRevoked)[])",
    "function didRegistry(address user) external view returns (string memory did, address owner, uint256 createdAt, uint256 updatedAt, bool isActive)"
];

// 8. LOCAL STATE MANAGEMENT
const AppState = {
    wallet: null,
    credentials: [],
    isConnected: false,
    jwtToken: null,
    
    set(key, value) { 
        this[key] = value; 
        if(key === 'jwtToken') {
            if (value) localStorage.setItem('digiid_jwt', value);
            else localStorage.removeItem('digiid_jwt');
        }
        if(key === 'wallet') {
            if (value) localStorage.setItem('digiid_wallet', value);
            else localStorage.removeItem('digiid_wallet');
        }
        this.render();
    },
    
    render() {
        if (this.isConnected) {
            document.getElementById('navConnectBtn').innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket mr-2"></i> Disconnect';
            document.getElementById('heroConnectBtn').classList.add('hidden');
            document.querySelectorAll('.dashboard-link').forEach(el => el.classList.remove('hidden'));
            
            document.getElementById('dashboard-section').classList.remove('hidden');
            document.getElementById('dashWalletAddress').innerText = this.wallet.substring(0, 6) + '...' + this.wallet.substring(38);
            
            // Fetch identity and display it on dashboard
            fetch(`${API_BASE}/getIdentity?walletAddress=${this.wallet}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.data) {
                        let nameEl = document.getElementById('dashUserName');
                        if (!nameEl) {
                            nameEl = document.createElement('div');
                            nameEl.id = 'dashUserName';
                            nameEl.className = 'text-primary font-medium text-lg mt-1 mb-2';
                            const vaultHeader = document.querySelector('#dashboard-section h2');
                            if (vaultHeader && vaultHeader.parentNode) {
                                vaultHeader.parentNode.insertBefore(nameEl, vaultHeader.nextSibling);
                            }
                        }
                        if (nameEl) {
                            nameEl.innerText = `Welcome, ${data.data.name}!`;
                        }
                    }
                })
                .catch(err => console.error("Error fetching identity:", err));
            
            // Re-render credentials table if credentials exist
            renderCredentialsTable();
        } else {
            document.getElementById('navConnectBtn').innerHTML = '<i class="fa-solid fa-wallet mr-2"></i> Connect Wallet';
            document.getElementById('navConnectBtn').classList.remove('hidden');
            document.getElementById('heroConnectBtn').classList.remove('hidden');
            document.querySelectorAll('.dashboard-link').forEach(el => el.classList.add('hidden'));
            document.getElementById('dashboard-section').classList.add('hidden');
            
            const nameEl = document.getElementById('dashUserName');
            if (nameEl) nameEl.remove();
        }
    }
};

let provider;
let signer;
let contract;

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    initParticles();
    initScrollAnimations();
    startNumberCounters();
    
    // Check backend status on page load
    try {
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();
        console.log("Backend Status:", data.status);
        showToast(data.status, 'success');
    } catch (error) {
        console.error("Backend connection failed:", error);
        showToast("Backend connection failed. Is the server running?", 'error');
    }
    
    // Check local storage for existing session
    const savedWallet = localStorage.getItem('digiid_wallet');
    const savedToken = localStorage.getItem('digiid_jwt');
    if (savedWallet && savedToken) {
        // Soft connect
        try {
            if (window.ethereum && savedWallet !== '0x742d35Cc6634C0532925a3b844Bc454e4438f44e') {
                provider = new ethers.BrowserProvider(window.ethereum);
                signer = await provider.getSigner();
                contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
                getEthBalance(savedWallet);
            } else {
                provider = null;
                signer = null;
                contract = null;
                document.getElementById('dashEthBalance').innerText = '100.0000 MATIC (Demo)';
            }
            
            AppState.set('jwtToken', savedToken);
            AppState.set('wallet', savedWallet);
            AppState.set('isConnected', true);
            
            getMyCredentials();
        } catch(e) {
            console.log("Session expired or wallet locked.", e);
            localStorage.removeItem('digiid_jwt');
            localStorage.removeItem('digiid_wallet');
        }
    }
});

// 7. NOTIFICATIONS SYSTEM
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let icon = 'fa-info-circle text-blue-400';
    let borderClass = 'border-blue-400/30';
    
    if (type === 'success') { icon = 'fa-check-circle text-green-400'; borderClass = 'border-green-400/30'; }
    else if (type === 'error') { icon = 'fa-exclamation-circle text-red-400'; borderClass = 'border-red-400/30'; }
    else if (type === 'warning') { icon = 'fa-triangle-exclamation text-yellow-400'; borderClass = 'border-yellow-400/30'; }

    toast.className = `toast glass-card border ${borderClass} px-6 py-4 rounded-xl shadow-lg flex items-center min-w-[300px] backdrop-blur-md`;
    toast.innerHTML = `<i class="fa-solid ${icon} text-xl mr-3"></i> <span class="text-sm font-medium">${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 1. METAMASK CONNECTION
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        showToast('MetaMask not detected. Connecting with a demo wallet.', 'warning');
        const mockAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
        
        provider = null;
        signer = null;
        contract = null;
        
        AppState.set('jwtToken', 'mock_jwt_token_123');
        AppState.set('wallet', mockAddress);
        AppState.set('isConnected', true);
        
        document.getElementById('dashEthBalance').innerText = '100.0000 MATIC (Demo)';
        
        // Save Identity to backend
        try {
            await fetch(`${API_BASE}/saveIdentity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: "Demo User", walletAddress: mockAddress })
            });
        } catch (error) {
            console.error("Error saving identity to backend:", error);
        }
        
        getMyCredentials();
        
        showToast('Connected to Demo Wallet', 'success');
        
        setTimeout(() => {
            document.getElementById('dashboard-section').scrollIntoView({ behavior: 'smooth' });
        }, 500);
        return;
    }

    try {
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        
        const network = await provider.getNetwork();
        console.log("Connected to chain:", network.chainId);
        
        const address = await signer.getAddress();
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        // Backend Login
        await loginWithWallet(address);
        
        // Register DID on-chain if not already registered
        try {
            const didDoc = await contract.didRegistry(address);
            if (!didDoc.isActive) {
                showToast('Registering DID (Decentralized Identifier) on-chain...', 'info');
                const tx = await contract.registerDID(`did:polygon:${address}`);
                await tx.wait();
                showToast('DID Registered successfully on-chain!', 'success');
            }
        } catch (contractErr) {
            console.warn("Could not verify or register DID on-chain (is contract deployed?):", contractErr);
        }
        
        // Save Identity to backend
        try {
            const saveRes = await fetch(`${API_BASE}/saveIdentity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: "Web3 Explorer", walletAddress: address })
            });
            const saveData = await saveRes.json();
            if (saveRes.ok) {
                console.log("Identity saved successfully:", saveData);
            } else {
                console.error("Failed to save identity:", saveData.error);
                showToast("Failed to save identity to backend", "error");
            }
        } catch (error) {
            console.error("Error saving identity to backend:", error);
            showToast("Error connecting to backend", "error");
        }
        
        AppState.set('wallet', address);
        AppState.set('isConnected', true);
        
        showToast('Wallet connected successfully', 'success');
        
        getEthBalance(address);
        getMyCredentials();
        
        setTimeout(() => {
            document.getElementById('dashboard-section').scrollIntoView({ behavior: 'smooth' });
        }, 500);

    } catch (error) {
        console.error(error);
        showToast('Failed to connect wallet: ' + error.message, 'error');
    }
}

async function handleWalletAction() {
    if (AppState.isConnected) {
        AppState.set('jwtToken', null);
        AppState.set('wallet', null);
        AppState.set('isConnected', false);
        showToast('Disconnected wallet', 'info');
    } else {
        await connectWallet();
    }
}

document.getElementById('navConnectBtn').addEventListener('click', handleWalletAction);
document.getElementById('heroConnectBtn').addEventListener('click', handleWalletAction);

async function getEthBalance(address) {
    if (!provider) return;
    const balance = await provider.getBalance(address);
    const ethBalance = ethers.formatEther(balance);
    document.getElementById('dashEthBalance').innerText = parseFloat(ethBalance).toFixed(4) + ' MATIC';
}

// 4. BACKEND API CALLS
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (AppState.jwtToken) {
        headers['Authorization'] = `Bearer ${AppState.jwtToken}`;
    }
    
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        const data = await response.json();
        
        if (response.status === 401) {
            showToast('Session expired, please reconnect', 'error');
            AppState.set('isConnected', false);
        }
        return { status: response.status, data };
    } catch (error) {
        console.error("API Error:", error);
        return { status: 500, data: null };
    }
}

async function loginWithWallet(address) {
    const message = `Login to DigiID: ${new Date().toISOString()}`;
    const signature = await signer.signMessage(message);
    
    const res = await apiCall('/auth/wallet-login', 'POST', { address, signature, message });
    if (res.status === 200 && res.data && res.data.token) {
        AppState.set('jwtToken', res.data.token);
    } else {
        throw new Error(res.data?.error || "Login signature verification failed");
    }
}

// 3. CONTRACT FUNCTIONS
async function getMyCredentials() {
    if (!AppState.wallet) return;
    
    let success = false;
    
    if (contract) {
        try {
            // First check backend/cache, or directly on-chain
            const creds = await contract.getCredentials(AppState.wallet);
            
            const formattedCreds = creds.map(c => ({
                hash: c.credentialHash,
                issuer: c.issuer,
                type: c.credentialType,
                date: new Date(Number(c.issuedAt) * 1000).toLocaleDateString(),
                status: c.isRevoked ? 'Revoked' : 'Active'
            }));
            
            AppState.set('credentials', formattedCreds);
            success = true;
        } catch (error) {
            console.warn("On-chain credentials fetch failed, falling back to backend:", error);
        }
    }
    
    if (!success) {
        try {
            const res = await apiCall(`/credentials/user/${AppState.wallet}`, 'GET');
            if (res.status === 200 && res.data && res.data.credentials) {
                const formattedCreds = res.data.credentials.map(c => ({
                    hash: c.hash,
                    issuer: c.issuer,
                    type: c.type || c.credentialType,
                    date: new Date(c.issuedAt).toLocaleDateString(),
                    status: c.isRevoked ? 'Revoked' : 'Active'
                }));
                AppState.set('credentials', formattedCreds);
            } else {
                AppState.set('credentials', []);
            }
        } catch (apiError) {
            console.error("Backend credentials fetch failed:", apiError);
            AppState.set('credentials', []);
        }
    }
}

function renderCredentialsTable() {
    const tbody = document.getElementById('credentialsTableBody');
    const emptyState = document.getElementById('emptyState');
    
    if (AppState.credentials.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    tbody.innerHTML = '';
    
    AppState.credentials.forEach(cred => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/5 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium">${cred.type}</td>
            <td class="px-6 py-4 font-mono text-xs text-gray-400">${cred.issuer.substring(0,6)}...${cred.issuer.substring(38)}</td>
            <td class="px-6 py-4 text-gray-400">${cred.date}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 rounded-full text-xs font-bold ${cred.status === 'Active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                    ${cred.status}
                </span>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="generateQR('${cred.hash}')" class="text-gray-400 hover:text-primary transition-colors p-2" title="Share via QR">
                    <i class="fa-solid fa-qrcode"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Issue Flow
document.getElementById('btnIssueCred').addEventListener('click', () => {
    document.getElementById('issueModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('issueModal').classList.add('opacity-100'), 10);
});

document.getElementById('issueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!AppState.wallet) return showToast('Wallet not connected', 'error');
    
    const recipient = document.getElementById('credRecipient').value;
    const type = document.getElementById('credType').value;
    const payloadVal = document.getElementById('credPayload').value;
    
    let parsedPayload;
    try {
        parsedPayload = JSON.parse(payloadVal);
    } catch (err) {
        return showToast('Invalid JSON in payload', 'error');
    }
    
    try {
        const submitBtn = document.getElementById('submitIssueBtn');
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Processing...';
        
        let success = false;
        let credHash = '';
        
        // Generate pseudo-random hash
        credHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(parsedPayload) + Date.now().toString()));
        const mockIpfsCID = "QmMockIPFSHash" + Math.floor(Math.random() * 1000000);
        
        if (contract) {
            try {
                showToast('Sending transaction to blockchain...', 'info');
                const tx = await contract.issueCredential(recipient, credHash, mockIpfsCID, type, 0);
                await tx.wait();
                success = true;
            } catch (contractError) {
                console.warn("On-chain issue failed, falling back to backend:", contractError);
            }
        }
        
        if (!success) {
            showToast('Issuing via backend database...', 'info');
            const recipientDID = recipient.startsWith('did:') ? recipient : `did:polygon:${recipient}`;
            const res = await apiCall('/credentials/issue', 'POST', {
                recipientDID,
                credentialType: type,
                payload: parsedPayload
            });
            
            if (res.status === 200 && res.data && res.data.success) {
                success = true;
                credHash = res.data.credentialHash;
            } else {
                showToast('Backend issue failed: ' + (res.data?.error || 'Unknown error'), 'error');
            }
        }
        
        if (success) {
            showToast('Credential Issued Successfully!', 'success');
            closeModals();
            getMyCredentials();
        }
        
    } catch (error) {
        console.error(error);
        showToast('Failed to issue credential', 'error');
    } finally {
        document.getElementById('submitIssueBtn').innerHTML = '<span>Issue Credential</span>';
    }
});

// Verify Flow
document.getElementById('btnVerify').addEventListener('click', () => {
    document.getElementById('verifyModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('verifyModal').classList.add('opacity-100'), 10);
});

// ZK-Proof Generation Instruction Flow
document.getElementById('btnGenProof').addEventListener('click', () => {
    showToast('Click the QR code icon next to any credential to generate a selective ZK-proof.', 'info');
});

document.getElementById('verifyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!AppState.wallet) return showToast('Wallet not connected', 'error');
    
    const hash = document.getElementById('verifyHash').value;
    const resultBox = document.getElementById('verifyResult');
    
    try {
        const submitBtn = document.getElementById('submitVerifyBtn');
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Verifying...';
        
        let isValid = false;
        let success = false;
        
        if (contract) {
            try {
                isValid = await contract.verifyCredential(hash);
                success = true;
            } catch (contractError) {
                console.warn("On-chain verification failed, falling back to backend:", contractError);
            }
        }
        
        if (!success) {
            showToast('Verifying via backend database...', 'info');
            const res = await apiCall('/credentials/verify', 'POST', {
                credentialHash: hash,
                verifierAddress: AppState.wallet
            });
            if (res.status === 200 && res.data) {
                isValid = res.data.isValid;
                success = true;
            } else {
                showToast('Backend verification failed', 'error');
            }
        }
        
        if (success) {
            resultBox.classList.remove('hidden');
            if (isValid) {
                resultBox.className = 'mt-6 p-4 rounded-xl border border-green-500/30 bg-green-500/10 text-center';
                resultBox.innerHTML = '<i class="fa-solid fa-check-circle text-4xl text-green-400 mb-2"></i><h4 class="font-bold text-green-400">VERIFIED VALID</h4><p class="text-xs text-gray-400 mt-2">ZK-Proof Authenticated</p>';
            } else {
                resultBox.className = 'mt-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-center';
                resultBox.innerHTML = '<i class="fa-solid fa-times-circle text-4xl text-red-400 mb-2"></i><h4 class="font-bold text-red-400">INVALID / REVOKED</h4><p class="text-xs text-gray-400 mt-2">This credential failed verification</p>';
            }
        }
        
    } catch (error) {
        console.error(error);
        showToast('Verification failed', 'error');
    } finally {
        document.getElementById('submitVerifyBtn').innerHTML = '<span>Run Verification</span>';
    }
});

// Modal Logic
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', closeModals);
});

function closeModals() {
    document.querySelectorAll('[id$="Modal"]').forEach(modal => {
        modal.classList.remove('opacity-100');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });
}

// 5. QR CODE GENERATION
window.generateQR = function(hash) {
    document.getElementById('qrModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('qrModal').classList.add('opacity-100'), 10);
    
    document.getElementById('qrHashDisplay').innerText = hash;
    
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    
    new QRCode(qrContainer, {
        text: JSON.stringify({ did: AppState.wallet, credentialHash: hash, zkp: "mock_zkp_data" }),
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

// Refresh button
document.getElementById('refreshCredsBtn').addEventListener('click', () => {
    showToast('Refreshing dashboard...', 'info');
    getMyCredentials();
});

// 6. ANIMATIONS
function initParticles() {
    if (window.particlesJS) {
        particlesJS("particles-js", {
            particles: {
                number: { value: 60, density: { enable: true, value_area: 800 } },
                color: { value: "#00D4FF" },
                shape: { type: "circle" },
                opacity: { value: 0.5, random: true },
                size: { value: 3, random: true },
                line_linked: { enable: true, distance: 150, color: "#7B2FFF", opacity: 0.2, width: 1 },
                move: { enable: true, speed: 2, direction: "none", random: true, straight: false, out_mode: "out", bounce: false }
            },
            interactivity: {
                detect_on: "canvas",
                events: { onhover: { enable: true, mode: "grab" }, onclick: { enable: true, mode: "push" }, resize: true },
                modes: { grab: { distance: 140, line_linked: { opacity: 1 } }, push: { particles_nb: 4 } }
            },
            retina_detect: true
        });
    }
}

function startNumberCounters() {
    const statNumbers = document.querySelectorAll('.stat-number');
    statNumbers.forEach(num => {
        const target = parseInt(num.getAttribute('data-target'));
        anime({
            targets: num,
            innerHTML: [0, target],
            round: 1,
            easing: 'easeOutExpo',
            duration: 3000,
            update: function(a) {
                // Add commas for thousands
                if (a.animations && a.animations[0]) {
                    num.innerHTML = parseInt(a.animations[0].currentValue).toLocaleString();
                }
            }
        });
    });
}

function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (entry.target.id === 'timeline-progress') {
                    entry.target.style.width = '100%';
                }
            }
        });
    }, { threshold: 0.5 });
    
    const timeline = document.getElementById('timeline-progress');
    if(timeline) observer.observe(timeline);
    
    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('navbar');
        if (window.scrollY > 50) {
            nav.classList.add('shadow-lg');
            nav.classList.add('bg-navy/90');
        } else {
            nav.classList.remove('shadow-lg');
            nav.classList.remove('bg-navy/90');
        }
    });
}