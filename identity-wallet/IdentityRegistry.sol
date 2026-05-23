// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract IdentityRegistry is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    struct DIDDocument {
        string did;
        address owner;
        uint256 createdAt;
        uint256 updatedAt;
        bool isActive;
    }

    struct Credential {
        bytes32 credentialHash;
        address issuer;
        address recipient;
        string credentialType;
        string ipfsCID;
        uint256 issuedAt;
        uint256 expiresAt;
        bool isRevoked;
    }

    mapping(address => DIDDocument) public didRegistry;
    mapping(bytes32 => Credential) public credentialRegistry;
    mapping(bytes32 => bool) public revocationRegistry;
    mapping(address => bytes32[]) private userCredentials;

    event DIDRegistered(address indexed owner, string did);
    event CredentialIssued(address indexed recipient, bytes32 hash);
    event CredentialRevoked(bytes32 indexed hash);
    event CredentialVerified(bytes32 indexed hash, bool result);

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ISSUER_ROLE, msg.sender);
        _setupRole(VERIFIER_ROLE, msg.sender);
    }

    function registerDID(string memory did) external whenNotPaused {
        require(!didRegistry[msg.sender].isActive, "DID already registered");
        
        didRegistry[msg.sender] = DIDDocument({
            did: did,
            owner: msg.sender,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            isActive: true
        });

        emit DIDRegistered(msg.sender, did);
    }

    function updateDID(string memory newDid) external whenNotPaused {
        require(didRegistry[msg.sender].isActive, "DID not registered");
        
        didRegistry[msg.sender].did = newDid;
        didRegistry[msg.sender].updatedAt = block.timestamp;
    }

    function revokeDID() external whenNotPaused {
        require(didRegistry[msg.sender].isActive, "DID not registered");
        didRegistry[msg.sender].isActive = false;
        didRegistry[msg.sender].updatedAt = block.timestamp;
    }

    function issueCredential(
        address recipient,
        bytes32 hash,
        string memory ipfsCID,
        string memory credType,
        uint256 expiresAt
    ) external onlyRole(ISSUER_ROLE) whenNotPaused {
        require(credentialRegistry[hash].issuedAt == 0, "Credential already exists");
        require(didRegistry[recipient].isActive, "Recipient DID is not active");

        Credential memory newCred = Credential({
            credentialHash: hash,
            issuer: msg.sender,
            recipient: recipient,
            credentialType: credType,
            ipfsCID: ipfsCID,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            isRevoked: false
        });

        credentialRegistry[hash] = newCred;
        userCredentials[recipient].push(hash);

        emit CredentialIssued(recipient, hash);
    }

    function revokeCredential(bytes32 hash) external onlyRole(ISSUER_ROLE) whenNotPaused {
        require(credentialRegistry[hash].issuedAt != 0, "Credential does not exist");
        require(credentialRegistry[hash].issuer == msg.sender, "Not the issuer");
        require(!credentialRegistry[hash].isRevoked, "Already revoked");

        credentialRegistry[hash].isRevoked = true;
        revocationRegistry[hash] = true;

        emit CredentialRevoked(hash);
    }

    function verifyCredential(bytes32 hash) external view returns (bool) {
        Credential memory cred = credentialRegistry[hash];
        
        if (cred.issuedAt == 0) return false;
        if (cred.isRevoked || revocationRegistry[hash]) return false;
        if (cred.expiresAt > 0 && block.timestamp > cred.expiresAt) return false;

        return true;
    }

    function getCredentials(address user) external view returns (Credential[] memory) {
        bytes32[] memory hashes = userCredentials[user];
        Credential[] memory creds = new Credential[](hashes.length);
        
        for (uint i = 0; i < hashes.length; i++) {
            creds[i] = credentialRegistry[hashes[i]];
        }
        
        return creds;
    }

    function batchIssue(
        address[] memory recipients,
        bytes32[] memory hashes,
        string[] memory ipfsCIDs,
        string[] memory credTypes,
        uint256[] memory expiresAts
    ) external onlyRole(ISSUER_ROLE) whenNotPaused {
        require(
            recipients.length == hashes.length &&
            hashes.length == ipfsCIDs.length &&
            ipfsCIDs.length == credTypes.length &&
            credTypes.length == expiresAts.length,
            "Mismatched array lengths"
        );

        for (uint i = 0; i < recipients.length; i++) {
            require(credentialRegistry[hashes[i]].issuedAt == 0, "Credential already exists");
            require(didRegistry[recipients[i]].isActive, "Recipient DID is not active");

            Credential memory newCred = Credential({
                credentialHash: hashes[i],
                issuer: msg.sender,
                recipient: recipients[i],
                credentialType: credTypes[i],
                ipfsCID: ipfsCIDs[i],
                issuedAt: block.timestamp,
                expiresAt: expiresAts[i],
                isRevoked: false
            });

            credentialRegistry[hashes[i]] = newCred;
            userCredentials[recipients[i]].push(hashes[i]);

            emit CredentialIssued(recipients[i], hashes[i]);
        }
    }
    
    // Emergency pause functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
