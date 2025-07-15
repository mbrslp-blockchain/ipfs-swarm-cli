#!/usr/bin/env node
/*  ipfs-swarm-cli  –  universal installer & swarm wizard
    Works on: Raspberry Pi 5 (arm64), x86_64, Apple Silicon, WSL
    
    Private IPFS Swarm Manager
    - Bootstrap node: First node that generates swarm key
    - Regular nodes: Connect to bootstrap using shared swarm key
    - Tailscale integration for secure networking
*/
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

const program = new Command();
const CONFIG_DIR = path.join(os.homedir(), '.ipfs-swarm');
const CONFIG = path.join(CONFIG_DIR, 'config.json');
const SWARM_KEY_PATH = path.join(CONFIG_DIR, 'swarm.key');

/* ---------- helpers ---------- */
const exists = (p) => fs.existsSync(p);
const saveCfg = (o) => fs.writeFileSync(CONFIG, JSON.stringify(o, null, 2));
const loadCfg = () => {
  if (!exists(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!exists(CONFIG)) {
    saveCfg({
      nodeType: 'bootstrap', // 'bootstrap' or 'regular'
      networkType: 'normal', // 'normal' or 'tailscale'
      swarmKey: null,
      basePort: 4001,
      bootstrapMultiaddr: null,
      nodeId: null,
      lastStarted: null,
      tailscaleIP: null,
    });
  }
  return JSON.parse(fs.readFileSync(CONFIG));
};

/* ---------- arch / platform ---------- */
const archMap = {
  arm64: 'arm64',
  x64: 'amd64',
  amd64: 'amd64',
  arm: 'arm64',
};
const arch = archMap[os.arch()] || 'amd64';
const platform = os.platform();

/* ---------- tool checking ---------- */
const checkTool = (tool) => {
  try {
    execSync(`which ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/* ---------- execution helpers ---------- */
const spinner = (text) => ora(text).start();
const execLive = (cmd, args = [], opts = {}) =>
  new Promise((resolve, reject) => {
    console.log(chalk.gray(`Running: ${cmd} ${args.join(' ')}`));
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: false,
      ...opts,
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        console.error(chalk.red(`Command failed: ${cmd} ${args.join(' ')}\nExit code: ${code}`));
        reject(new Error(`Exit code ${code}`));
      }
    });
  });

const execSilent = (cmd, args = []) => {
  try {
    const result = execSync(`${cmd} ${args.join(' ')}`, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return { success: true, stdout: result, stderr: '' };
  } catch (error) {
    return { success: false, stdout: '', stderr: error.message };
  }
};

/* ---------- tailscale helpers ---------- */
const isTailscaleInstalled = () => checkTool('tailscale');

const isTailscaleRunning = () => {
  try {
    const result = execSilent('tailscale', ['status']);
    return result.success && !result.stdout.includes('Stopped');
  } catch {
    return false;
  }
};

const getTailscaleIP = () => {
  try {
    const result = execSilent('tailscale', ['ip', '-4']);
    return result.success ? result.stdout.trim() : null;
  } catch {
    return null;
  }
};

const getTailscaleStatus = () => {
  try {
    const result = execSilent('tailscale', ['status', '--json']);
    if (result.success) {
      const status = JSON.parse(result.stdout);
      return {
        running: status.BackendState === 'Running',
        loggedIn: status.BackendState !== 'NeedsLogin',
        ip: status.TailscaleIPs?.[0] || null,
        hostname: status.Self?.HostName || null,
      };
    }
  } catch {}
  return { running: false, loggedIn: false, ip: null, hostname: null };
};

const installTailscale = async () => {
  const spin = spinner('Installing Tailscale');
  try {
    if (platform === 'linux') {
      await execLive('curl', ['-fsSL', 'https://tailscale.com/install.sh'], { 
        stdio: ['ignore', 'pipe', 'inherit'] 
      });
      await execLive('sh', ['-c', 'curl -fsSL https://tailscale.com/install.sh | sh']);
    } else if (platform === 'darwin') {
      await execLive('brew', ['install', 'tailscale']);
    } else {
      throw new Error('Unsupported platform for automatic Tailscale installation');
    }
    spin.succeed('Tailscale installed');
  } catch (e) {
    spin.fail(e.message);
    throw e;
  }
};

const setupTailscale = async () => {
  const status = getTailscaleStatus();
  
  if (!status.running) {
    console.log(chalk.yellow('Starting Tailscale...'));
    const spin = spinner('Starting Tailscale daemon');
    try {
      await execLive('sudo', ['tailscale', 'up']);
      spin.succeed();
    } catch (e) {
      spin.fail();
      console.log(chalk.red('Failed to start Tailscale automatically.'));
      console.log(chalk.yellow('Please run manually: sudo tailscale up'));
      console.log(chalk.cyan('Then visit: https://login.tailscale.com/ to authenticate'));
      
      const { continueSetup } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueSetup',
          message: 'Have you completed Tailscale authentication?',
          default: false,
        },
      ]);
      
      if (!continueSetup) {
        throw new Error('Tailscale setup incomplete');
      }
    }
  }
  
  // Verify connection
  const finalStatus = getTailscaleStatus();
  if (!finalStatus.running || !finalStatus.ip) {
    throw new Error('Tailscale is not properly configured');
  }
  
  console.log(chalk.green(`✅ Tailscale ready: ${finalStatus.ip} (${finalStatus.hostname})`));
  return finalStatus.ip;
};

const testTailscaleConnection = async (targetIP) => {
  if (!targetIP) return false;
  
  console.log(chalk.yellow(`Testing connection to ${targetIP}...`));
  const result = execSilent('ping', ['-c', '3', '-W', '3', targetIP]);
  
  if (result.success) {
    console.log(chalk.green(`✅ Connection to ${targetIP} successful`));
    return true;
  } else {
    console.log(chalk.red(`❌ Cannot reach ${targetIP}`));
    return false;
  }
};

/* ---------- installers ---------- */
const installTools = async (includeTailscale = false) => {
  let requiredTools = ['wget', 'curl', 'net-tools', 'openssl'];
  
  if (includeTailscale && !isTailscaleInstalled()) {
    console.log(chalk.yellow('Tailscale not found, will install it...'));
  }
  
  const missing = requiredTools.filter((tool) => !checkTool(tool));

  if (missing.length === 0 && (!includeTailscale || isTailscaleInstalled())) {
    console.log(chalk.green('All required tools are already installed'));
    if (includeTailscale && isTailscaleInstalled()) {
      console.log(chalk.green('Tailscale is already installed'));
    }
    return;
  }

  if (missing.length > 0) {
    console.log(chalk.yellow(`Missing tools: ${missing.join(', ')}`));
    const spin = spinner('Installing missing tools');
    try {
      if (platform === 'linux') {
        await execLive('sudo', ['apt-get', 'update']);
        await execLive('sudo', ['apt-get', 'install', '--no-upgrade', '-y', ...missing]);
      } else if (platform === 'darwin') {
        for (const tool of missing) {
          await execLive('brew', ['install', tool]);
        }
      }
      spin.succeed();
    } catch (e) {
      spin.fail(e.message);
      throw e;
    }
  }
  
  // Install Tailscale if needed
  if (includeTailscale && !isTailscaleInstalled()) {
    await installTailscale();
  }
};

const installKubo = async () => {
  const binPath = '/usr/local/bin/ipfs';
  const result = execSilent(binPath, ['version']);
  if (result.success) {
    console.log(chalk.green('Kubo is already installed'));
    return;
  }

  const kuboVersion = '0.35.0';
  const tar = `kubo_v${kuboVersion}_${platform}-${arch}.tar.gz`;
  const spin = spinner('Installing Kubo');
  try {
    console.log(chalk.yellow(`Downloading Kubo: ${tar}`));
    await execLive('wget', [
      '-q',
      `https://github.com/ipfs/kubo/releases/download/v${kuboVersion}/${tar}`,
      '-O',
      `/tmp/${tar}`,
    ]);
    await execLive('tar', ['-xzf', `/tmp/${tar}`, '-C', '/tmp']);
    await execLive('sudo', ['cp', '/tmp/kubo/ipfs', binPath]);
    await execLive('sudo', ['chmod', '+x', binPath]);
    await execLive('rm', ['-rf', '/tmp/kubo', `/tmp/${tar}`]);
    await execLive(binPath, ['version']);
    spin.succeed();
  } catch (e) {
    spin.fail(e.message);
    throw e;
  }
};

/* ---------- swarm key management ---------- */
const generateSwarmKey = () => {
  if (exists(SWARM_KEY_PATH)) {
    console.log(chalk.green('Swarm key already exists'));
    return SWARM_KEY_PATH;
  }

  const key = `/key/swarm/psk/1.0.0/
/base16/
${require('crypto').randomBytes(32).toString('hex')}`;
  
  fs.writeFileSync(SWARM_KEY_PATH, key);
  fs.chmodSync(SWARM_KEY_PATH, 0o600);
  console.log(chalk.green('Generated new swarm key'));
  return SWARM_KEY_PATH;
};

const installSwarmKey = (swarmKeyPath) => {
  const ipfsSwarmKey = path.join(os.homedir(), '.ipfs', 'swarm.key');
  if (!exists(swarmKeyPath)) {
    throw new Error('Swarm key file not found');
  }
  fs.copyFileSync(swarmKeyPath, ipfsSwarmKey);
  fs.chmodSync(ipfsSwarmKey, 0o600);
  console.log(chalk.green('Swarm key installed'));
};

/* ---------- IPFS management ---------- */
const isIpfsInitialized = () => {
  const configPath = path.join(os.homedir(), '.ipfs', 'config');
  return exists(configPath);
};

const initializeIpfs = async () => {
  if (isIpfsInitialized()) {
    console.log(chalk.green('IPFS already initialized'));
    return;
  }

  console.log(chalk.yellow('Initializing IPFS...'));
  await execLive('ipfs', ['init', '--profile=server']);
};

const configureIpfs = async (cfg) => {
  console.log(chalk.yellow('Configuring IPFS for private swarm...'));
  
  // Install swarm key
  if (cfg.swarmKey) {
    installSwarmKey(cfg.swarmKey);
  }

  // Configure IPFS settings
  await execLive('ipfs', ['config', '--bool', 'Discovery.MDNS.Enabled', 'false']);
  await execLive('ipfs', ['config', 'Routing.Type', 'dht']);
  await execLive('ipfs', ['config', '--json', 'AutoTLS', '{"Enabled":false}']);
  await execLive('ipfs', ['config', '--json', 'Swarm.ConnMgr', '{"LowWater":10,"HighWater":100}']);
  
  // Set addresses
  const swarmAddresses = `["/ip4/0.0.0.0/tcp/${cfg.basePort}","/ip6/::/tcp/${cfg.basePort}"]`;
  await execLive('ipfs', ['config', '--json', 'Addresses.Swarm', swarmAddresses]);
  await execLive('ipfs', ['config', 'Addresses.API', `/ip4/127.0.0.1/tcp/${cfg.basePort + 1000}`]);
  await execLive('ipfs', ['config', 'Addresses.Gateway', `/ip4/127.0.0.1/tcp/${cfg.basePort + 4080}`]);

  // Clear default bootstrap nodes
  await execLive('ipfs', ['bootstrap', 'rm', '--all']);

  // Add custom bootstrap if this is not a bootstrap node
  if (cfg.nodeType === 'regular' && cfg.bootstrapMultiaddr) {
    await execLive('ipfs', ['bootstrap', 'add', cfg.bootstrapMultiaddr]);
  }

  console.log(chalk.green('IPFS configured for private swarm'));
};

/* ---------- daemon management ---------- */
const isDaemonRunning = async () => {
  const result = execSilent('ipfs', ['swarm', 'peers']);
  return result.success;
};

const getPeerId = async () => {
  const result = execSilent('ipfs', ['id']);
  if (result.success) {
    try {
      const data = JSON.parse(result.stdout);
      return data.ID;
    } catch (e) {
      throw new Error('Failed to parse peer ID');
    }
  }
  
  const templateResult = execSilent('ipfs', ['id', '-f', '<id>']);
  if (templateResult.success) {
    return templateResult.stdout.trim();
  }
  
  throw new Error('Failed to get peer ID');
};

const waitForDaemon = async (maxWait = 15000) => {
  const startTime = Date.now();
  console.log(chalk.yellow('Waiting for daemon to start...'));
  
  while (Date.now() - startTime < maxWait) {
    if (await isDaemonRunning()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.stdout.write('.');
  }
  console.log('');
  return false;
};

const killDaemon = async () => {
  try {
    const result = execSilent('ipfs', ['shutdown']);
    if (result.success) return;
  } catch {}
  
  try {
    execSilent('pkill', ['-f', 'ipfs daemon']);
  } catch {}
  
  await new Promise(resolve => setTimeout(resolve, 1000));
};

const getExternalIP = async () => {
  try {
    const result = execSilent('curl', ['-s', '--max-time', '5', 'https://api.ipify.org']);
    return result.success ? result.stdout.trim() : null;
  } catch {
    return null;
  }
};

/* ---------- commands ---------- */
program
  .command('init')
  .description('Initialize IPFS swarm node')
  .option('--bootstrap', 'Set up as bootstrap node')
  .option('--regular', 'Set up as regular node')
  .option('--tailscale', 'Use Tailscale networking')
  .option('--normal', 'Use normal IP networking')
  .option('--swarm-key <path>', 'Path to existing swarm key file')
  .option('--bootstrap-addr <addr>', 'Bootstrap node multiaddr')
  .option('--port <port>', 'Base port number', '4001')
  .action(async (options) => {
    console.log(chalk.cyan(`
╔════════════════════════════════════════════╗
║     IPFS Swarm CLI – Private Swarm Manager ║
║     Kubo v0.35.0 – Private Network Setup   ║
║     With Tailscale Integration             ║
╚════════════════════════════════════════════╝
`));

    const cfg = loadCfg();
    let answers = {};

    // Interactive mode if no options provided
    if (!options.bootstrap && !options.regular) {
      answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'nodeType',
          message: 'What type of node is this?',
          choices: [
            { name: 'Bootstrap Node (First/Primary node)', value: 'bootstrap' },
            { name: 'Regular Node (Joins existing swarm)', value: 'regular' }
          ]
        },
        {
          type: 'list',
          name: 'networkType',
          message: 'How do you want to connect nodes?',
          choices: [
            { name: 'Normal IP (Public/LAN)', value: 'normal' },
            { name: 'Tailscale (Secure mesh network)', value: 'tailscale' }
          ]
        },
        {
          type: 'input',
          name: 'basePort',
          message: 'Base port number:',
          default: cfg.basePort,
          validate: (n) => !isNaN(n) && n > 1024 && n < 65535
        }
      ]);

      // Additional prompts for regular nodes
      if (answers.nodeType === 'regular') {
        const regularAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'swarmKeyPath',
            message: 'Path to swarm key file:',
            validate: (path) => path && exists(path) || 'File does not exist'
          },
          {
            type: 'input',
            name: 'bootstrapMultiaddr',
            message: 'Bootstrap node multiaddr:',
            validate: (addr) => addr && addr.includes('/p2p/') || 'Invalid multiaddr format'
          }
        ]);
        Object.assign(answers, regularAnswers);
      }
    } else {
      // Command line mode
      answers.nodeType = options.bootstrap ? 'bootstrap' : 'regular';
      answers.networkType = options.tailscale ? 'tailscale' : 'normal';
      answers.basePort = parseInt(options.port);
      answers.swarmKeyPath = options.swarmKey;
      answers.bootstrapMultiaddr = options.bootstrapAddr;
    }

    // Update configuration
    Object.assign(cfg, answers);
    
    // Validate configuration
    if (cfg.nodeType === 'regular') {
      if (!cfg.swarmKeyPath || !exists(cfg.swarmKeyPath)) {
        console.error(chalk.red('Error: Swarm key file is required for regular nodes'));
        process.exit(1);
      }
      if (!cfg.bootstrapMultiaddr) {
        console.error(chalk.red('Error: Bootstrap multiaddr is required for regular nodes'));
        process.exit(1);
      }
    }

    const steps = [
      { 
        name: 'Installing required tools', 
        fn: () => installTools(cfg.networkType === 'tailscale') 
      },
      { name: 'Installing Kubo', fn: installKubo },
      { 
        name: 'Stopping existing daemon', 
        fn: async () => {
          try {
            await killDaemon();
          } catch (e) {
            console.log(chalk.gray('No existing daemon to stop'));
          }
        }
      },
      { name: 'Initializing IPFS', fn: initializeIpfs },
    ];

    // Setup Tailscale if needed
    if (cfg.networkType === 'tailscale') {
      steps.push({
        name: 'Setting up Tailscale',
        fn: async () => {
          const tailscaleIP = await setupTailscale();
          cfg.tailscaleIP = tailscaleIP;
          saveCfg(cfg);
        }
      });
    }

    if (cfg.nodeType === 'bootstrap') {
      steps.push({
        name: 'Generating swarm key',
        fn: () => {
          cfg.swarmKey = generateSwarmKey();
          saveCfg(cfg);
        }
      });
    } else {
      steps.push({
        name: 'Setting swarm key',
        fn: () => {
          cfg.swarmKey = cfg.swarmKeyPath;
          saveCfg(cfg);
        }
      });
      
      // Test connection to bootstrap if using Tailscale
      if (cfg.networkType === 'tailscale' && cfg.bootstrapMultiaddr) {
        steps.push({
          name: 'Testing connection to bootstrap',
          fn: async () => {
            const match = cfg.bootstrapMultiaddr.match(/\/ip4\/([^\/]+)\//);
            if (match) {
              await testTailscaleConnection(match[1]);
            }
          }
        });
      }
    }

    steps.push({
      name: 'Configuring IPFS',
      fn: () => configureIpfs(cfg)
    });

    // Execute steps
    for (const step of steps) {
      const spin = spinner(step.name);
      try {
        await step.fn();
        spin.succeed();
      } catch (e) {
        spin.fail(e.message);
        process.exit(1);
      }
    }

    console.log(chalk.green('✅ Node initialization complete!'));
    
    if (cfg.nodeType === 'bootstrap') {
      console.log(chalk.yellow('\n📋 Bootstrap Node Setup Complete:'));
      console.log(chalk.white(`  • Network Type: ${cfg.networkType}`));
      console.log(chalk.white(`  • Swarm key generated: ${cfg.swarmKey}`));
      if (cfg.networkType === 'tailscale') {
        console.log(chalk.white(`  • Tailscale IP: ${cfg.tailscaleIP}`));
      }
      console.log(chalk.white(`  • Share this key with other nodes`));
      console.log(chalk.white(`  • Run 'ipfs-swarm-cli start' to begin`));
    } else {
      console.log(chalk.yellow('\n📋 Regular Node Setup Complete:'));
      console.log(chalk.white(`  • Network Type: ${cfg.networkType}`));
      console.log(chalk.white(`  • Connected to bootstrap: ${cfg.bootstrapMultiaddr}`));
      if (cfg.networkType === 'tailscale') {
        console.log(chalk.white(`  • Tailscale IP: ${cfg.tailscaleIP}`));
      }
      console.log(chalk.white(`  • Run 'ipfs-swarm-cli start' to join swarm`));
    }
  });

program
  .command('start')
  .description('Start IPFS daemon')
  .action(async () => {
    const cfg = loadCfg();

    // Check Tailscale if needed
    if (cfg.networkType === 'tailscale') {
      const status = getTailscaleStatus();
      if (!status.running) {
        console.log(chalk.red('❌ Tailscale is not running'));
        console.log(chalk.yellow('Please run: sudo tailscale up'));
        console.log(chalk.cyan('Or visit: https://login.tailscale.com/ to authenticate'));
        return;
      }
      console.log(chalk.green(`✅ Tailscale connected: ${status.ip} (${status.hostname})`));
    }
    
    if (await isDaemonRunning()) {
      console.log(chalk.yellow('IPFS daemon is already running'));
      return;
    }

    console.log(chalk.blue(`Starting ${cfg.nodeType} node (${cfg.networkType} network)...`));
    
    // Kill any existing daemon
    await killDaemon();
    
    // Start daemon
    const daemonProcess = spawn('ipfs', ['daemon'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    daemonProcess.unref();
    
    // Wait for daemon to start
    const started = await waitForDaemon(20000);
    if (!started) {
      console.error(chalk.red('❌ Daemon failed to start'));
      process.exit(1);
    }
    
    console.log(chalk.green('✅ IPFS daemon started successfully'));
    
    // Update last started time
    cfg.lastStarted = new Date().toISOString();
    
    // Get and display node information
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const peerId = await getPeerId();
      cfg.nodeId = peerId;
      saveCfg(cfg);
      
      console.log(chalk.cyan('\n📊 Node Information:'));
      console.log(chalk.white(`  Node ID: ${peerId}`));
      console.log(chalk.white(`  Type: ${cfg.nodeType}`));
      console.log(chalk.white(`  Network: ${cfg.networkType}`));
      console.log(chalk.white(`  Port: ${cfg.basePort}`));
      
      if (cfg.nodeType === 'bootstrap') {
        const localMultiaddr = `/ip4/127.0.0.1/tcp/${cfg.basePort}/p2p/${peerId}`;
        console.log(chalk.yellow('\n🚀 Bootstrap Node Ready:'));
        console.log(chalk.white(`  Local: ${localMultiaddr}`));
        
        if (cfg.networkType === 'tailscale' && cfg.tailscaleIP) {
          const tailscaleMultiaddr = `/ip4/${cfg.tailscaleIP}/tcp/${cfg.basePort}/p2p/${peerId}`;
          console.log(chalk.white(`  Tailscale: ${tailscaleMultiaddr}`));
          console.log(chalk.green('\n📋 Share this information with other nodes:'));
          console.log(chalk.white(`  Swarm Key: ${cfg.swarmKey}`));
          console.log(chalk.white(`  Bootstrap Address: ${tailscaleMultiaddr}`));
        } else {
          const externalIP = await getExternalIP();
          if (externalIP) {
            const externalMultiaddr = `/ip4/${externalIP}/tcp/${cfg.basePort}/p2p/${peerId}`;
            console.log(chalk.white(`  External: ${externalMultiaddr}`));
            console.log(chalk.green('\n📋 Share this information with other nodes:'));
            console.log(chalk.white(`  Swarm Key: ${cfg.swarmKey}`));
            console.log(chalk.white(`  Bootstrap Address: ${externalMultiaddr}`));
          }
        }
      } else {
        console.log(chalk.yellow('\n🔗 Regular Node Connected'));
        console.log(chalk.white(`  Bootstrap: ${cfg.bootstrapMultiaddr}`));
        if (cfg.networkType === 'tailscale') {
          console.log(chalk.white(`  Tailscale IP: ${cfg.tailscaleIP}`));
        }
      }
    } catch (e) {
      console.error(chalk.yellow(`ℹ️  Node started successfully. Use 'info' command for connection details.`));
    }
  });

program
  .command('tailscale')
  .description('Manage Tailscale connection')
  .action(async () => {
    if (!isTailscaleInstalled()) {
      console.log(chalk.red('❌ Tailscale is not installed'));
      const { install } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'install',
          message: 'Would you like to install Tailscale?',
          default: true,
        },
      ]);
      
      if (install) {
        await installTailscale();
      } else {
        return;
      }
    }

    const status = getTailscaleStatus();
    
    console.log(chalk.cyan('📡 Tailscale Status:'));
    console.log(chalk.white(`  Installed: ${isTailscaleInstalled() ? '✅' : '❌'}`));
    console.log(chalk.white(`  Running: ${status.running ? '✅' : '❌'}`));
    console.log(chalk.white(`  Logged In: ${status.loggedIn ? '✅' : '❌'}`));
    
    if (status.ip) {
      console.log(chalk.white(`  IP Address: ${status.ip}`));
    }
    
    if (status.hostname) {
      console.log(chalk.white(`  Hostname: ${status.hostname}`));
    }

    if (!status.running) {
      console.log(chalk.yellow('\n🔧 To start Tailscale:'));
      console.log(chalk.white('  sudo tailscale up'));
      console.log(chalk.cyan('  Then visit: https://login.tailscale.com/'));
      
      const { startNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'startNow',
          message: 'Would you like to start Tailscale now?',
          default: true,
        },
      ]);
      
      if (startNow) {
        await setupTailscale();
      }
    }
  });

// Add the rest of your existing commands (stop, status, info, test, clean) here...
// They remain the same as in your original code

program
  .command('stop')
  .description('Stop IPFS daemon')
  .action(async () => {
    const spin = spinner('Stopping IPFS daemon');
    try {
      await killDaemon();
      spin.succeed();
    } catch (e) {
      spin.fail(e.message);
    }
  });

program
  .command('status')
  .description('Show swarm status')
  .action(async () => {
    const cfg = loadCfg();
    
    if (!(await isDaemonRunning())) {
      console.log(chalk.red('❌ IPFS daemon is not running'));
      return;
    }

    console.log(chalk.green('✅ IPFS daemon is running'));
    console.log(chalk.cyan(`Node type: ${cfg.nodeType}`));
    console.log(chalk.cyan(`Network type: ${cfg.networkType}`));
    
    if (cfg.networkType === 'tailscale') {
      const status = getTailscaleStatus();
      console.log(chalk.cyan(`Tailscale: ${status.running ? '✅' : '❌'} ${status.ip || ''}`));
    }
    
    // Get peer information
    const peersResult = execSilent('ipfs', ['swarm', 'peers']);
    if (peersResult.success) {
      const peers = peersResult.stdout.trim().split('\n').filter(Boolean);
      console.log(chalk.yellow(`\n🔗 Connected peers: ${peers.length}`));
      peers.forEach((peer, i) => {
        console.log(chalk.white(`  ${i + 1}. ${peer}`));
      });
    }

    // Get node ID and addresses
    const idResult = execSilent('ipfs', ['id']);
    if (idResult.success) {
      const id = JSON.parse(idResult.stdout);
      console.log(chalk.cyan(`\n📊 Node Information:`));
      console.log(chalk.white(`  ID: ${id.ID}`));
      if (id.Addresses && id.Addresses.length > 0) {
        console.log(chalk.white(`  Addresses:`));
        id.Addresses.forEach((addr) => {
          console.log(chalk.white(`    ${addr}`));
        });
      }
    }
  });

program
  .command('info')
  .description('Show configuration and connection info')
  .action(async () => {
    const cfg = loadCfg();
    
    console.log(chalk.cyan('📋 Node Configuration:'));
    console.log(chalk.white(`  Type: ${cfg.nodeType}`));
    console.log(chalk.white(`  Network: ${cfg.networkType}`));
    console.log(chalk.white(`  Port: ${cfg.basePort}`));
    console.log(chalk.white(`  Swarm Key: ${cfg.swarmKey || 'Not set'}`));
    
    if (cfg.networkType === 'tailscale') {
      const status = getTailscaleStatus();
      console.log(chalk.white(`  Tailscale IP: ${status.ip || 'Not connected'}`));
      console.log(chalk.white(`  Tailscale Status: ${status.running ? 'Running' : 'Stopped'}`));
    }
    
    if (cfg.nodeType === 'bootstrap') {
      console.log(chalk.yellow('\n🚀 Bootstrap Node Info:'));
      if (cfg.nodeId) {
        console.log(chalk.white(`  Node ID: ${cfg.nodeId}`));
        const localMultiaddr = `/ip4/127.0.0.1/tcp/${cfg.basePort}/p2p/${cfg.nodeId}`;
        console.log(chalk.white(`  Local Multiaddr: ${localMultiaddr}`));
        
        if (cfg.networkType === 'tailscale' && cfg.tailscaleIP) {
          const tailscaleMultiaddr = `/ip4/${cfg.tailscaleIP}/tcp/${cfg.basePort}/p2p/${cfg.nodeId}`;
          console.log(chalk.white(`  Tailscale Multiaddr: ${tailscaleMultiaddr}`));
        } else {
          const externalIP = await getExternalIP();
          if (externalIP) {
            const externalMultiaddr = `/ip4/${externalIP}/tcp/${cfg.basePort}/p2p/${cfg.nodeId}`;
            console.log(chalk.white(`  External Multiaddr: ${externalMultiaddr}`));
          } else {
            console.log(chalk.gray(`  External IP: Unable to detect`));
          }
        }
      } else {
        console.log(chalk.gray(`  Node not started yet`));
      }
    } else {
      console.log(chalk.yellow('\n🔗 Regular Node Info:'));
      console.log(chalk.white(`  Bootstrap: ${cfg.bootstrapMultiaddr || 'Not set'}`));
    }
  });

program
  .command('test')
  .description('Test IPFS functionality')
  .action(async () => {
    const cfg = loadCfg();
    
    if (!(await isDaemonRunning())) {
      console.log(chalk.red('❌ IPFS daemon is not running'));
      return;
    }

    const spin = spinner('Testing IPFS functionality');
    try {
      const testContent = `Hello IPFS Private Swarm! ${new Date().toISOString()}`;
      fs.writeFileSync('/tmp/ipfs-test.txt', testContent);

      const addResult = execSilent('ipfs', ['add', '-q', '/tmp/ipfs-test.txt']);
      if (!addResult.success) {
        throw new Error('Failed to add file');
      }
      
      const cid = addResult.stdout.trim();
      const getResult = execSilent('ipfs', ['cat', cid]);
      
      fs.unlinkSync('/tmp/ipfs-test.txt');
      
      if (getResult.success && getResult.stdout.trim() === testContent) {
        spin.succeed();
        console.log(chalk.green(`✅ Test successful! CID: ${cid}`));
      } else {
        spin.fail('Content mismatch');
      }
    } catch (e) {
      spin.fail(e.message);
    }
  });

program
  .command('clean')
  .description('Clean all IPFS data and configuration')
  .action(async () => {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'This will delete ALL IPFS data and swarm configuration. Continue?',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Cleanup cancelled'));
      return;
    }

    const spin = spinner('Cleaning up');
    try {
      await killDaemon();
      
      const ipfsDir = path.join(os.homedir(), '.ipfs');
      if (exists(ipfsDir)) {
        await execLive('rm', ['-rf', ipfsDir]);
      }
      
      if (exists(CONFIG_DIR)) {
        await execLive('rm', ['-rf', CONFIG_DIR]);
      }
      
      spin.succeed('Cleanup complete');
    } catch (e) {
      spin.fail(e.message);
    }
  });

program.parse(process.argv);
if (!process.argv.slice(2).length) {
  program.help();
}