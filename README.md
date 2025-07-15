# IPFS Swarm CLI

**Universal Installer & Swarm Wizard for Private IPFS Networks**

This CLI tool simplifies setting up and managing a private IPFS swarm. It works on various platforms including Raspberry Pi 5 (arm64), x86_64, Apple Silicon, and WSL. The tool handles installation of dependencies, Kubo (IPFS implementation), swarm key management, node configuration, and optional Tailscale integration for secure, NAT-traversing connectivity.

- **Bootstrap Node**: The first/primary node that generates a shared swarm key.
- **Regular Nodes**: Additional nodes that join the swarm using the shared key and connect to the bootstrap node.

Private swarms ensure nodes only connect within your network, ideal for secure, decentralized file sharing.

## Features

- Automatic installation of tools (wget, curl, etc.) and Kubo (IPFS v0.35.0).
- Interactive setup for bootstrap or regular nodes.
- Swarm key generation and management.
- Daemon management (start/stop/status).
- Optional Tailscale integration for easy connectivity across devices/NATs.
- Testing and cleanup commands.
- Detailed status and info outputs.

## Requirements

- **Node.js**: Version 14+ (install via `nvm` or package manager).
- **Operating System**: Linux (e.g., Ubuntu, Debian, Raspberry Pi OS), macOS (Darwin). Windows via WSL.
- **Sudo Access**: Required for installing tools, Kubo, and Tailscale. If you're stuck with permissions during installation, run commands with `sudo` (e.g., `sudo apt-get install ...` on Linux).
- **Internet Access**: For downloading Kubo and Tailscale.
- **Ports**: Base port (default 4001) and derivatives (e.g., 5001 for API, 8080 for Gateway) must be open or forwarded if behind a firewall/NAT.
- **Tailscale (Optional)**: For cross-device connectivity without port forwarding. Requires a free Tailscale account.

**Note**: If you're on a fresh system and missing basic tools, the CLI will attempt to install them. If it fails due to permissions, manually run `sudo apt-get update && sudo apt-get install wget curl net-tools openssl` (on Debian-based Linux) or equivalent for your OS.

## Installation

### Global Installation (Recommended)

Install the CLI globally using npm for easy access from anywhere:

```bash
npm install -g ipfs-swarm-cli
```

This makes the `ipfs-swarm-cli` command available in your terminal. If you encounter permission issues (e.g., EACCES errors), use `sudo npm install -g ipfs-swarm-cli` or fix npm permissions (see [npm docs](https://docs.npmjs.com/resolving-permission-problems)).

### Local Installation (In a Specific Folder)

If you prefer to install in a project folder:

1. Create a directory: `mkdir my-ipfs-swarm && cd my-ipfs-swarm`
2. Initialize npm: `npm init -y`
3. Install: `npm install ipfs-swarm-cli`
4. Run via npx: `npx ipfs-swarm-cli <command>`

To make it executable locally, add a script to `package.json`:

```json
"scripts": {
  "swarm": "ipfs-swarm-cli"
}
```

Then run `npm run swarm <command>`.

**Accessing the CLI**: After installation, use `ipfs-swarm-cli` (global) or `npx ipfs-swarm-cli` (local). If not found, ensure your PATH includes `~/.npm-global/bin` (for global installs).

## Quick Start

1. Install the CLI (see above).
2. Initialize a node: `ipfs-swarm-cli init` (interactive mode).
3. Start the daemon: `ipfs-swarm-cli start`.
4. Check status: `ipfs-swarm-cli status`.
5. Test: `ipfs-swarm-cli test`.

For a full swarm setup, see below.

## Commands

- **`init`**: Initialize a node (bootstrap or regular). Options: `--bootstrap`, `--regular`, `--swarm-key <path>`, `--bootstrap-addr <addr>`, `--port <port>`.
- **`start`**: Start the IPFS daemon. Checks for Tailscale if needed.
- **`stop`**: Stop the IPFS daemon.
- **`status`**: Show daemon status, connected peers, and node info.
- **`info`**: Display configuration, node ID, multiaddrs, etc.
- **`test`**: Add and retrieve a test file to verify IPFS functionality.
- **`clean`**: Delete all IPFS data and configurations (prompts for confirmation).

Run `ipfs-swarm-cli --help` for details.

## Setting Up a Swarm

### 1. Bootstrap Node (First Node)

- Run `ipfs-swarm-cli init` and select "Bootstrap Node".
- It will:
  - Install tools and Kubo if missing.
  - Generate a swarm key at `~/.ipfs-swarm/swarm.key`.
  - Initialize and configure IPFS for private swarm.
- Start the daemon: `ipfs-swarm-cli start`.
- Get info: `ipfs-swarm-cli info` (shows Node ID, local/external multiaddrs).
- **Share**: Copy the swarm key file and bootstrap multiaddr (e.g., `/ip4/<external-ip>/tcp/4001/p2p/<node-id>`) with other nodes.

**Swarm Key Management**:
- The key is generated in `~/.ipfs-swarm/swarm.key`.
- Copy this file to other nodes (e.g., via SCP: `scp ~/.ipfs-swarm/swarm.key user@otherhost:~/.ipfs-swarm/swarm.key`).
- Ensure permissions: `chmod 600 ~/.ipfs-swarm/swarm.key`.

### 2. Regular Nodes (Joining Nodes)

- Copy the swarm key from the bootstrap node to `~/.ipfs-swarm/swarm.key` on the new node.
- Run `ipfs-swarm-cli init` and select "Regular Node".
- Provide:
  - Path to swarm key (e.g., `~/.ipfs-swarm/swarm.key`).
  - Bootstrap multiaddr (from bootstrap's `info` command).
  - Optional: Tailscale/reachable address if using Tailscale.
- Start the daemon: `ipfs-swarm-cli start`.
- Verify connections: `ipfs-swarm-cli status` (should show peers).

### Accessing the Swarm

- **API**: Available at `http://127.0.0.1:<basePort + 1000>` (e.g., 5001). Use `ipfs` CLI or HTTP API.
- **Gateway**: `http://127.0.0.1:<basePort + 4080>` (e.g., 8080) for browsing files.
- Add files: `ipfs add <file>` (daemon must be running).
- Get files: `ipfs cat <cid>` or via gateway `/ipfs/<cid>`.
- Swarm peers: `ipfs swarm peers`.

## Tailscale Integration

Tailscale provides a secure VPN for connecting nodes across networks without port forwarding. It's optional but recommended for distributed setups.

### Setup

1. **Install Tailscale**:
   - The CLI prompts during `start` (for regular nodes) if not detected.
   - Manually: Run `curl -fsSL https://tailscale.com/install.sh | sh` then `sudo tailscale up`.
   - On macOS: Use Homebrew (`brew install tailscale`) or download from [Tailscale](https://tailscale.com/download).

2. **Login to Tailscale**:
   - Run `sudo tailscale up` – it will provide a login URL.
   - Open the URL in a browser, sign in with Google/Microsoft/GitHub (free account).
   - Authorize the device. Repeat on every device in your swarm.

3. **Device Setup**:
   - Install Tailscale on all nodes (bootstrap and regular).
   - Ensure all devices are in the same Tailscale network (tailnet).
   - Get Tailscale IP: `tailscale ip -4` (e.g., 100.x.x.x).
   - For regular nodes, during `init`, provide a Tailscale multiaddr like `/ip4/<tailscale-ip>/tcp/4001/p2p/<bootstrap-node-id>`.

4. **Why Tailscale?**
   - Handles NAT traversal automatically.
   - Secure (WireGuard-based).
   - No need for public IPs or port forwarding.

**Common Tailscale Issues**:
- Not logged in: Run `tailscale status` – if "Stopped", run `sudo tailscale up` and login.
- Device not authorized: Check your Tailscale admin console (login.tailscale.com).
- Connectivity: Ensure devices are online and in the same tailnet.

## Troubleshooting & Points of Failure

### Installation Issues
- **Missing Tools**: If auto-install fails, manually install: `sudo apt-get install wget curl net-tools openssl` (Linux) or `brew install` (macOS).
- **Kubo Download Fails**: Check internet; manually download from [GitHub](https://github.com/ipfs/kubo/releases).
- **Permissions**: Use `sudo` for system-wide installs. For npm, avoid global installs or fix permissions.

### Initialization/Configuration
- **Swarm Key Not Found**: Ensure it's copied to `~/.ipfs-swarm/swarm.key` and permissions are 600.
- **Invalid Multiaddr**: Must include `/p2p/<node-id>`. Get from bootstrap's `info`.
- **Port Conflicts**: Change base port during `init` if 4001 is in use.

### Daemon Issues
- **Won't Start**: Check `ipfs daemon` output (run manually for logs). Common: Port in use (`netstat -tuln`), or config errors.
- **Not Connecting**: Verify swarm key matches, bootstrap is running, ports open. Use Tailscale if behind NAT.
- **Daemon Not Running**: Use `status` to check; restart with `start`.
- **Kill Fails**: Manually `pkill -f "ipfs daemon"` or `killall ipfs`.

### Connectivity Failures
- **No Peers**: Run `ipfs swarm peers`. Ensure firewall allows TCP ports (e.g., `sudo ufw allow 4001`).
- **NAT/Firewall**: Use Tailscale or forward ports on router.
- **External IP Detection Fails**: Manual check with `curl ifconfig.me`; use Tailscale IPs instead.

### Other
- **Test Fails**: Ensure daemon is running; check disk space/permissions in `/tmp`.
- **Cleanup Stuck**: Manually delete `~/.ipfs` and `~/.ipfs-swarm`.
- **Platform-Specific**: On WSL, ensure Windows firewall allows ports. On Raspberry Pi, update OS first.

If stuck, check console outputs (chalk-colored for clarity). For bugs, open an issue on GitHub.

## Contributing

Fork the repo, make changes, and submit a PR. Ensure code is formatted with Prettier (print width 80).

## License

MIT License. See LICENSE file.

---

Happy swarming! 🚀 If you have questions, check the code or raise an issue.
