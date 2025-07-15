# IPFS Swarm CLI

A comprehensive CLI tool for managing private IPFS swarms. This tool simplifies the process of setting up and maintaining IPFS nodes in a private swarm configuration.

## Table of Contents
- [Installation](#installation)
  - [Global Installation](#global-installation)
  - [Local Installation](#local-installation)
- [Usage](#usage)
  - [Commands](#commands)
  - [Options](#options)
  - [Configuration](#configuration)
- [Setup Process](#setup-process)
  - [Bootstrap Node](#bootstrap-node)
  - [Regular Node](#regular-node)
- [Swarm Key Management](#swarm-key-management)
  - [Generating Swarm Key](#generating-swarm-key)
  - [Sharing Swarm Key](#sharing-swarm-key)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
  - [Debugging](#debugging)
- [Advanced Topics](#advanced-topics)
  - [Tailscale Integration](#tailscale-integration)
  - [Custom Ports](#custom-ports)
- [Security Considerations](#security-considerations)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Global Installation
To install the package globally using npm:

```bash
npm install -g ipfs-swarm-cli
```

### Local Installation
To install the package locally:

```bash
npm install ipfs-swarm-cli
```

## Usage

### Commands

The CLI supports the following commands:

```bash
ipfs-swarm-cli [command]
```

#### Commands List:
- `init`: Initialize IPFS swarm node
- `start`: Start IPFS daemon
- `stop`: Stop IPFS daemon
- `status`: Show swarm status
- `info`: Show configuration and connection info
- `test`: Test IPFS functionality
- `clean`: Clean all IPFS data and configuration

### Options

#### Init Command Options:
```bash
ipfs-swarm-cli init [options]
```

- `--bootstrap`: Set up as bootstrap node
- `--regular`: Set up as regular node
- `--swarm-key <path>`: Path to existing swarm key file
- `--bootstrap-addr <addr>`: Bootstrap node multiaddr
- `--port <port>`: Base port number (default: 4001)

### Configuration

The tool creates a configuration file at `~/.ipfs-swarm/config.json` with the following structure:

```json
{
  "nodeType": "bootstrap", // or "regular"
  "swarmKey": "<path-to-swarm-key>",
  "basePort": 4001,
  "bootstrapMultiaddr": "<multiaddr>",
  "nodeId": "<node-id>",
  "lastStarted": "<timestamp>"
}
```

## Setup Process

### Bootstrap Node
1. Initialize the bootstrap node:
   ```bash
   ipfs-swarm-cli init --bootstrap
   ```
2. This will generate a swarm key at `~/.ipfs-swarm/swarm.key`
3. Share the swarm key with other nodes
4. Start the daemon:
   ```bash
   ipfs-swarm-cli start
   ```

### Regular Node
1. Initialize the regular node:
   ```bash
   ipfs-swarm-cli init --regular --swarm-key <path-to-swarm-key> --bootstrap-addr <bootstrap-multiaddr>
   ```
2. Start the daemon:
   ```bash
   ipfs-swarm-cli start
   ```

## Swarm Key Management

### Generating Swarm Key
The swarm key is automatically generated when initializing a bootstrap node. You can also generate it manually using:

```bash
ipfs-swarm-cli init --bootstrap
```

### Sharing Swarm Key
1. Copy the swarm key file from the bootstrap node:
   ```bash
   scp ~/.ipfs-swarm/swarm.key user@remote:/path/to/swarm.key
   ```
2. Use the swarm key when initializing regular nodes:
   ```bash
   ipfs-swarm-cli init --regular --swarm-key /path/to/swarm.key --bootstrap-addr <bootstrap-multiaddr>
   ```

## Troubleshooting

### Common Issues

#### 1. Port Conflicts
- **Symptom**: Daemon fails to start with port already in use
- **Solution**:
  1. Check if port is in use:
     ```bash
     netstat -tuln | grep <port>
     ```
  2. Update configuration to use different port:
     ```bash
     ipfs-swarm-cli init --port <new-port>
     ```

#### 2. Connection Issues
- **Symptom**: Nodes cannot connect to each other
- **Solution**:
  1. Verify bootstrap multiaddr is correct
  2. Check firewall rules
  3. Ensure Tailscale is running (if used)

#### 3. Daemon Not Starting
- **Symptom**: Daemon fails to start
- **Solution**:
  1. Check logs:
     ```bash
     journalctl -u ipfs -f
     ```
  2. Verify IPFS installation
  3. Clean up and retry:
     ```bash
     ipfs-swarm-cli clean && ipfs-swarm-cli init
     ```

### Debugging
1. Enable verbose logging:
   ```bash
   DEBUG=* ipfs-swarm-cli <command>
   ```
2. Check IPFS configuration:
   ```bash
   ipfs config show
   ```

## Advanced Topics

### Tailscale Integration
1. Install Tailscale:
   ```bash
   ipfs-swarm-cli init --regular --install-tailscale
   ```
2. Use Tailscale addresses for bootstrap nodes

### Custom Ports
1. Configure custom base port:
   ```bash
   ipfs-swarm-cli init --port 4002
   ```
2. Update firewall rules to allow traffic on new port

## Security Considerations

1. **Swarm Key Security**:
   - Never share the swarm key publicly
   - Store swarm key securely
   - Set proper permissions:
     ```bash
     chmod 600 ~/.ipfs-swarm/swarm.key
     ```

2. **IPFS Configuration**:
   - Restrict API access to localhost
   - Disable MDNS discovery
   - Use secure connection methods

## Contributing

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feature/MyFeature
   ```
3. Commit changes
4. Push to the branch:
   ```bash
   git push origin feature/MyFeature
   ```
5. Open a Pull Request

## License

[Your License Here]
