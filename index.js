#!/usr/bin/env node
/*  ipfs-swarm-cli  –  universal installer & swarm wizard
    Works on: Raspberry Pi 5 (arm64), x86_64, Apple Silicon, WSL
    
    Private IPFS Swarm Manager
    - Bootstrap node: First node that generates swarm key
    - Regular nodes: Connect to bootstrap using shared swarm key
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
      swarmKey: null,
      basePort: 4001,
      bootstrapMultiaddr: null,
      nodeId: null,
      lastStarted: null,
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

/* ---------- installers ---------- */
const installTools = async () => {
  const requiredTools = ['wget', 'curl', 'net-tools', 'openssl'];
  const missing = requiredTools.filter((tool) => !checkTool(tool));

  if (missing.length === 0) {
    console.log(chalk.green('All required tools are already installed'));
    return;
  }

  console.log(chalk.yellow(`Missing tools: ${missing.join(', ')}`));
  const spin = spinner('Installing missing tools');
  try {
    if (platform === 'linux') {
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

  // Configure IPFS settings - Fixed JSON configuration
  await execLive('ipfs', ['config', '--bool', 'Discovery.MDNS.Enabled', 'false']);
  await execLive('ipfs', ['config', 'Routing.Type', 'dht']);
  
  // Fix: Use proper JSON quoting
  await execLive('ipfs', ['config', '--json', 'AutoTLS', '{"Enabled":false}']);
  await execLive('ipfs', ['config', '--json', 'Swarm.ConnMgr', '{"LowWater":10,"HighWater":100}']);
  
  // Set addresses - Fix: Use proper JSON array format
  const swarmAddresses = `["/ip4/0.0.0.0/tcp/${cfg.basePort}","/ip6/::/tcp/${cfg.basePort}"]`;
  await execLive('ipfs', ['config', '--json', 'Addresses.Swarm', swarmAddresses]);
  await execLive('ipfs', ['config', 'Addresses.API', `/ip4/127.0.0.1/tcp/${cfg.basePort + 1000}`]);
  await execLive('ipfs', ['config', 'Addresses.Gateway', `/ip4/127.0.0.1/tcp/${cfg.basePort + 4080}`]);

  // Clear default bootstrap nodes (important for private swarm)
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
  // Method 1: Use JSON parsing (more reliable)
  const result = execSilent('ipfs', ['id']);
  if (result.success) {
    try {
      const data = JSON.parse(result.stdout);
      return data.ID;
    } catch (e) {
      throw new Error('Failed to parse peer ID');
    }
  }

  
  
  // Method 2: Alternative template approach
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
  // Try graceful shutdown first
  try {
    const result = execSilent('ipfs', ['shutdown']);
    if (result.success) return;
  } catch {}
  
  // If graceful shutdown fails, try to kill the process
  try {
    const result = execSilent('pkill', ['-f', 'ipfs daemon']);  // Added -f flag back
    // Don't throw error if no process found
  } catch {}
  
  // Give it a moment to clean up
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
  .option('--swarm-key <path>', 'Path to existing swarm key file')
  .option('--bootstrap-addr <addr>', 'Bootstrap node multiaddr')
  .option('--port <port>', 'Base port number', '4001')
  .action(async (options) => {
    console.log(chalk.cyan(`
╔════════════════════════════════════════════╗
║     IPFS Swarm CLI – Private Swarm Manager ║
║     Kubo v0.35.0 – Private Network Setup   ║
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
          type: 'input',
          name: 'basePort',
          message: 'Base port number:',
          default: cfg.basePort,
          validate: (n) => !isNaN(n) && n > 1024 && n < 65535
        },
        {
          type: 'input',
          name: 'swarmKeyPath',
          message: 'Path to swarm key file (leave empty for bootstrap):',
          when: (a) => a.nodeType === 'regular',
          validate: (path) => !path || exists(path) || 'File does not exist'
        },
        {
          type: 'input',
          name: 'bootstrapMultiaddr',
          message: 'Bootstrap node multiaddr:',
          when: (a) => a.nodeType === 'regular',
          validate: (addr) => addr && addr.includes('/p2p/') || 'Invalid multiaddr format'
        }
      ]);
    } else {
      // Command line mode
      answers.nodeType = options.bootstrap ? 'bootstrap' : 'regular';
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
      { name: 'Installing required tools', fn: installTools },
      { name: 'Installing Kubo', fn: installKubo },
      { name: 'Stopping existing daemon', 
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
      console.log(chalk.white(`  • Swarm key generated: ${cfg.swarmKey}`));
      console.log(chalk.white(`  • Share this key with other nodes`));
      console.log(chalk.white(`  • Run 'ipfs-swarm-cli start' to begin`));
    } else {
      console.log(chalk.yellow('\n📋 Regular Node Setup Complete:'));
      console.log(chalk.white(`  • Connected to bootstrap: ${cfg.bootstrapMultiaddr}`));
      console.log(chalk.white(`  • Run 'ipfs-swarm-cli start' to join swarm`));
    }
  });

program
  .command('start')
  .description('Start IPFS daemon')
  .action(async () => {
    const cfg = loadCfg();
    
    if (await isDaemonRunning()) {
      console.log(chalk.yellow('IPFS daemon is already running'));
      return;
    }

    console.log(chalk.blue(`Starting ${cfg.nodeType} node...`));
    
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
      console.log(chalk.white(`  Port: ${cfg.basePort}`));
      
      if (cfg.nodeType === 'bootstrap') {
        const localMultiaddr = `/ip4/127.0.0.1/tcp/${cfg.basePort}/p2p/${peerId}`;
        console.log(chalk.yellow('\n🚀 Bootstrap Node Ready:'));
        console.log(chalk.white(`  Local: ${localMultiaddr}`));
        
        const externalIP = await getExternalIP();
        if (externalIP) {
          const externalMultiaddr = `/ip4/${externalIP}/tcp/${cfg.basePort}/p2p/${peerId}`;
          console.log(chalk.white(`  External: ${externalMultiaddr}`));
          console.log(chalk.green('\n📋 Share this information with other nodes:'));
          console.log(chalk.white(`  Swarm Key: ${cfg.swarmKey}`));
          console.log(chalk.white(`  Bootstrap Address: ${externalMultiaddr}`));
        }
      } else {
        console.log(chalk.yellow('\n🔗 Regular Node Connected'));
        console.log(chalk.white(`  Bootstrap: ${cfg.bootstrapMultiaddr}`));
      }
    } catch (e) {
      console.error(chalk.yellow(`ℹ️  Node started successfully. Use 'info' command for connection details.`));
    }
  });

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
    console.log(chalk.white(`  Port: ${cfg.basePort}`));
    console.log(chalk.white(`  Swarm Key: ${cfg.swarmKey || 'Not set'}`));
    
    if (cfg.nodeType === 'bootstrap') {
      console.log(chalk.yellow('\n🚀 Bootstrap Node Info:'));
      if (cfg.nodeId) {
        console.log(chalk.white(`  Node ID: ${cfg.nodeId}`));
        const localMultiaddr = `/ip4/127.0.0.1/tcp/${cfg.basePort}/p2p/${cfg.nodeId}`;
        console.log(chalk.white(`  Local Multiaddr: ${localMultiaddr}`));
        
        const externalIP = await getExternalIP();
        if (externalIP) {
          const externalMultiaddr = `/ip4/${externalIP}/tcp/${cfg.basePort}/p2p/${cfg.nodeId}`;
          console.log(chalk.white(`  External Multiaddr: ${externalMultiaddr}`));
        } else {
          console.log(chalk.gray(`  External IP: Unable to detect`));
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