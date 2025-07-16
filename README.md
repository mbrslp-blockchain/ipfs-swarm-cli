# IPFS Private Swarm CLI - Complete Setup Guide

## Table of Contents
1. [Understanding IPFS Private Swarms](#understanding-ipfs-private-swarms)
2. [Installation](#installation)
3. [Setting Up Bootstrap Node](#setting-up-bootstrap-node)
4. [Adding Regular Nodes](#adding-regular-nodes)
5. [Testing Your Swarm](#testing-your-swarm)
6. [Monitoring and Management](#monitoring-and-management)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Configuration](#advanced-configuration)

## Understanding IPFS Private Swarms

### What is IPFS?
IPFS (InterPlanetary File System) is a distributed, peer-to-peer protocol for storing and sharing data. It creates a decentralized network where files are identified by their content (using cryptographic hashes) rather than their location.

### Private Swarms Explained
A private IPFS swarm is an isolated network of IPFS nodes that:
- Only communicate with each other (not the public IPFS network)
- Share a common **swarm key** for authentication
- Have their own bootstrap nodes for peer discovery
- Provide complete control over data storage and access

### Key Concepts

**Bootstrap Node**: The first/primary node in your swarm that:
- Generates the swarm key
- Acts as the entry point for other nodes
- Helps with peer discovery

**Regular Node**: Secondary nodes that:
- Join an existing swarm using the bootstrap node's information
- Use the same swarm key as the bootstrap node
- Can store and retrieve data from the swarm

**Swarm Key**: A cryptographic key that:
- Ensures only authorized nodes can join
- Provides network isolation from public IPFS
- Must be shared securely between all nodes

**Multiaddr**: IPFS addressing format that specifies:
- Network protocol (IP4/IP6)
- IP address and port
- Node ID (peer ID)
- Example: `/ip4/192.168.1.100/tcp/4001/p2p/QmNodeID...`

## Installation

### Prerequisites
- Linux (Ubuntu/Debian recommended) or macOS
- Node.js and npm
- sudo privileges
- Internet connection for initial setup

### Install the CLI
```bash
npm install -g ipfs-swarm-cli
```

### Verify Installation
```bash
ipfs-swarm-cli --help
```

## Setting Up Bootstrap Node

The bootstrap node is the foundation of your private swarm. Follow these steps:

### Step 1: Initialize Bootstrap Node

#### Interactive Setup (Recommended)
```bash
ipfs-swarm-cli init
```

You'll be prompted to choose:
- **Node Type**: Select "Bootstrap Node (First/Primary node)"
- **Network Type**: 
  - "Normal IP" for local network or public internet
  - "Tailscale" for secure mesh networking
- **Port**: Default 4001 (or choose custom)

#### Command Line Setup
```bash
# For normal IP networking
ipfs-swarm-cli init --bootstrap --normal --port 4001

# For Tailscale networking
ipfs-swarm-cli init --bootstrap --tailscale --port 4001
```

### Step 2: Start Bootstrap Node
```bash
ipfs-swarm-cli start
```

### Step 3: Record Bootstrap Information
After starting, you'll see output like:
```
📊 Node Information:
  Node ID: QmBootstrapNodeID123...
  Type: bootstrap
  Network: normal
  Port: 4001

🚀 Bootstrap Node Ready:
  Local: /ip4/127.0.0.1/tcp/4001/p2p/QmBootstrapNodeID123...
  External: /ip4/203.0.113.1/tcp/4001/p2p/QmBootstrapNodeID123...

📋 Share this information with other nodes:
  Swarm Key: /home/user/.ipfs-swarm/swarm.key
  Bootstrap Address: /ip4/203.0.113.1/tcp/4001/p2p/QmBootstrapNodeID123...
```

**Important**: Save both the swarm key file and bootstrap address - you'll need them for regular nodes!

### Step 4: Verify Bootstrap Node
```bash
# Check daemon status
ipfs-swarm-cli status

# View detailed info
ipfs-swarm-cli info

# Test functionality
ipfs-swarm-cli test
```

## Adding Regular Nodes

Regular nodes join the existing swarm using the bootstrap node's information.

### Step 1: Copy Swarm Key
Transfer the swarm key file from the bootstrap node to your regular node:
```bash
# Copy from bootstrap node (adjust path as needed)
scp user@bootstrap-ip:/home/user/.ipfs-swarm/swarm.key ./swarm.key
```

### Step 2: Initialize Regular Node

#### Interactive Setup
```bash
ipfs-swarm-cli init
```

Choose:
- **Node Type**: "Regular Node (Joins existing swarm)"
- **Network Type**: Match your bootstrap node's choice
- **Port**: Default 4001 (or match bootstrap)
- **Swarm Key Path**: Path to the copied swarm key file
- **Bootstrap Address**: The multiaddr from bootstrap node

#### Command Line Setup
```bash
# For normal networking
ipfs-swarm-cli init --regular --normal --port 4001 \
  --swarm-key ./swarm.key \
  --bootstrap-addr "/ip4/203.0.113.1/tcp/4001/p2p/QmBootstrapNodeID123..."

# For Tailscale networking
ipfs-swarm-cli init --regular --tailscale --port 4001 \
  --swarm-key ./swarm.key \
  --bootstrap-addr "/ip4/100.64.0.1/tcp/4001/p2p/QmBootstrapNodeID123..."
```

### Step 3: Start Regular Node
```bash
ipfs-swarm-cli start
```

### Step 4: Verify Connection
```bash
# Check if connected to swarm
ipfs-swarm-cli status

# Should show connected peers
ipfs-swarm-cli debug
```

## Testing Your Swarm

### Basic Connectivity Test
On any node:
```bash
ipfs-swarm-cli test
```

### Manual File Operations
```bash
# Add a file to IPFS
echo "Hello Private Swarm!" > test.txt
ipfs add test.txt
# Returns: QmHash123...

# Retrieve file from another node
ipfs cat QmHash123...
# Should return: Hello Private Swarm!
```

### Check Peer Connections
```bash
# List connected peers
ipfs swarm peers

# Show local node addresses
ipfs swarm addrs local

# Show bootstrap list
ipfs bootstrap list
```

## Monitoring and Management

### Check Status
```bash
# Quick status check
ipfs-swarm-cli status

# Detailed configuration
ipfs-swarm-cli info

# Debug connection issues
ipfs-swarm-cli debug
```

### Start/Stop Management
```bash
# Start daemon
ipfs-swarm-cli start

# Stop daemon
ipfs-swarm-cli stop

# Restart (stop then start)
ipfs-swarm-cli stop && ipfs-swarm-cli start
```

### Manual Peer Connection
```bash
# Connect to specific peer
ipfs-swarm-cli connect "/ip4/192.168.1.100/tcp/4001/p2p/QmPeerID..."
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "IPFS daemon is not running"
**Solution:**
```bash
ipfs-swarm-cli start
```

#### 2. "No peers connected"
**Diagnosis:**
```bash
ipfs-swarm-cli debug
```

**Common causes:**
- Firewall blocking port 4001
- Incorrect bootstrap address
- Network connectivity issues
- Swarm key mismatch

**Solutions:**
```bash
# Check firewall (Ubuntu/Debian)
sudo ufw status
sudo ufw allow 4001

# Test manual connection
ipfs-swarm-cli connect "/ip4/BOOTSTRAP_IP/tcp/4001/p2p/PEER_ID"

# Verify bootstrap configuration
ipfs bootstrap list
```

#### 3. "Connection refused" errors
**Solutions:**
```bash
# Check if daemon is running
ps aux | grep ipfs

# Kill existing processes
ipfs-swarm-cli stop

# Clear and restart
ipfs-swarm-cli stop
ipfs-swarm-cli start
```

#### 4. "Swarm key mismatch"
**Solution:**
- Ensure all nodes use the exact same swarm key file
- Re-copy the key from bootstrap node
- Reinitialize with correct key

#### 5. Port conflicts
**Symptoms:**
- "Address already in use" errors
- Daemon won't start

**Solutions:**
```bash
# Check what's using the port
sudo netstat -tulpn | grep :4001

# Kill conflicting processes
sudo pkill -f "ipfs daemon"

# Use different port
ipfs-swarm-cli init --port 4002
```

#### 6. Tailscale connectivity issues
**Diagnosis:**
```bash
ipfs-swarm-cli tailscale
```

**Solutions:**
```bash
# Start Tailscale
sudo tailscale up

# Check IP
tailscale ip

# Test connection
ping TAILSCALE_IP
```

### Advanced Debugging

#### View Full IPFS Configuration
```bash
ipfs config show
```

#### Check Swarm Addresses
```bash
ipfs swarm addrs local
```

#### Monitor Logs
```bash
# View daemon logs
ipfs log tail
```

#### Network Diagnostics
```bash
# Test external connectivity
curl -s https://api.ipify.org  # Shows public IP

# Test port connectivity
nc -zv BOOTSTRAP_IP 4001
```

## Advanced Configuration

### Custom Port Configuration
```bash
# Initialize with custom port
ipfs-swarm-cli init --port 5001

# This sets:
# - Swarm port: 5001
# - API port: 6001 (5001 + 1000)
# - Gateway port: 9081 (5001 + 4080)
```

### Tailscale Setup
```bash
# Install and configure Tailscale
ipfs-swarm-cli tailscale

# Initialize with Tailscale
ipfs-swarm-cli init --tailscale
```

### Clean Reinstall
```bash
# Remove all IPFS data and configuration
ipfs-swarm-cli clean

# Reinstall from scratch
ipfs-swarm-cli init
```

### Configuration Files
```bash
# Main config
~/.ipfs-swarm/config.json

# Swarm key
~/.ipfs-swarm/swarm.key

# IPFS data
~/.ipfs/
```

### Web Interface Access
Once running, access the IPFS web interface at:
- API: `http://localhost:5001` (port + 1000)
- Gateway: `http://localhost:8081` (port + 4080)

### Sample Network Topology
```
Bootstrap Node (192.168.1.100)
├── Regular Node 1 (192.168.1.101)
├── Regular Node 2 (192.168.1.102)
└── Regular Node 3 (100.64.0.1) [Tailscale]
```

## Security Considerations

1. **Swarm Key Security**: Keep your swarm key secure and only share with trusted nodes
2. **Network Isolation**: Private swarms are isolated from public IPFS
3. **Firewall Rules**: Only open necessary ports (4001 by default)
4. **Regular Updates**: Keep IPFS updated for security patches

## Performance Tips

1. **Resource Allocation**: IPFS can use significant CPU/memory with many files
2. **Storage Management**: Monitor disk usage in `~/.ipfs/blocks/`
3. **Connection Limits**: Default connection manager limits are adequate for most use cases
4. **Garbage Collection**: Run `ipfs repo gc` periodically to clean unused data

This guide should get you started with a fully functional private IPFS swarm. For additional help, use `ipfs-swarm-cli --help` or check the debug command for connection issues.
