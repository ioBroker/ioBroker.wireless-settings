'use strict';

const utils = require('@iobroker/adapter-core');
const wifi = require('node-wifi');
const networkInterfaces = require('os').networkInterfaces;
const dns = require('dns');
const fs = require('fs');
const Netmask = require('netmask').Netmask
const si = require('systeminformation');
const adapterName = require('./package.json').name.split('.').pop();
// const childProcess = require('child_process');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const configFile = __dirname + '/data/network.json';
const configTemplateFile = __dirname + '/data/network.template.json';
let interfacesFile = '/etc/dhcpcd.conf';

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;

const sudo = async (command, password) => {
    return (await exec(`sudo ${command}`)).stdout.trim();
    //return childProcess.execSync(`echo ${password} | sudo -S command`).toString().trim();
    // return childProcess.execSync(command).toString().trim();
};

const argumentEscape = argument => {
    return `'${argument.replace(/'/, /\\'/g)}'`;
};

const getConfig = () => {
    if (!fs.existsSync(configFile)) {
        fs.copyFileSync(configTemplateFile, configFile);
    }
    return JSON.parse(fs.readFileSync(configFile).toString());
};

const setConfig = config => {
    if (!fs.existsSync(configFile)) {
        fs.copyFileSync(configTemplateFile, configFile);
    }
    fs.writeFileSync(configFile, JSON.stringify(config, null, 4));
};

const wifiConnect = async (ssid, password) => {
    const config = getConfig();
    config.wlan0.wifi = ssid;
    config.wlan0.wifiPassword = !!password;
    setConfig(config);
    if (password) {
        const wpaSupplicant = `
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=RU

network={
    ssid="${ssid}"
    psk="${password}"
    key_mgmt=WPA-PSK
}
`;

        await exec(`echo ${argumentEscape(wpaSupplicant)} | sudo tee /etc/wpa_supplicant/wpa_supplicant.conf`);
    } else {
        const wpaSupplicant = `
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=RU

network={
    ssid="${ssid}"
    key_mgmt=NONE
}
`;
        await exec(`echo ${argumentEscape(wpaSupplicant)} | sudo tee /etc/wpa_supplicant/wpa_supplicant.conf`);
    }
    // await sudo('service wpa_supplicant restart');
    await writeInterfaces(true);
};

const wifiDisconnect = async () => {
    const config = getConfig();
    delete config.wlan0.wifi;
    delete config.wlan0.wifiPassword;
    setConfig(config);
    const wpaSupplicant = `
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=RU
    `;
    await exec(`echo ${argumentEscape(wpaSupplicant)} | sudo tee /etc/wpa_supplicant/wpa_supplicant.conf`);
    // await sudo('wpa_cli reconfigure');
    await writeInterfaces(true);
};

const writeInterfaces = async (wifiOnly) => {
    const config = getConfig();
    let interfaces = `
hostname
clientid
persistent
option rapid_commit
option domain_name_servers, domain_name, domain_search, host_name
option classless_static_routes
option interface_mtu
require dhcp_server_identifier
slaac private    
`;

    Object.keys(config).forEach(iface => {
        const ifaceConfig = config[iface];
        interfaces += ifaceConfig.dhcp ? `
        ` : `
interface ${iface}
static ip_address=${ifaceConfig.ip4}/${new Netmask(ifaceConfig.ip4 + '/' + ifaceConfig.ip4subnet).bitmask}
static routers=${ifaceConfig.ip4gateway}
static domain_name_servers=${ifaceConfig.dns.join(' ')}
static ip6_address=${ifaceConfig.ip6}/${ifaceConfig.ip6subnet}
        `;
    });

    console.log(interfaces);
    // await exec(`echo ${argumentEscape(interfaces)} | sudo tee ${interfacesFile}`);
    if (interfacesFile) {
        fs.writeFileSync(interfacesFile, interfaces);

        await sudo('ip addr flush wlan0');
        await sudo('ip addr flush eth0');
        await sudo('ifconfig wlan0 down');
        await sudo('ifconfig wlan0 up');
        await sudo('service dhcpcd restart');
    }
};

const getWiFi = async () => {
    const networks = [];
    const iwlist = (await exec('sudo iwlist scan')).stdout;
    let currentNetwork = null;
    iwlist.split('\n').forEach(line => {
        line = line.trim();
        if (line.startsWith('Cell')) {
            currentNetwork = {security: []};
            networks.push(currentNetwork);
        }
        let matches;
        if ((matches = line.match(/^ESSID:"(.*)"/))) {
            currentNetwork.ssid = matches[1];
        }
        if (line.match(/Encryption key:off/)) {
            currentNetwork.security.push('Open');
        }
        if (line.match(/IE: WPA Version 1/)) {
            currentNetwork.security.push('WPA');
        }
        if (line.match(/IEEE 802\.11i\/WPA2 Version 1/)) {
            currentNetwork.security.push('WPA2');
        }
    });

    return networks;
};

const getWiFiConnections = async () => {
    let ssid = null;
    try {
        ssid = (await exec('iwgetid -r')).stdout.trim();
    } catch (e) {

    }
    return ssid ? [{ssid}] : [];
};

const triggers = {
    interfaces: async (input, response) => {
        si.networkInterfaces(async result => {
            if (process.platform === 'win32') {
                const nativeInterfaces = networkInterfaces();
                response(result.map(interfaceItem => {
                    interfaceItem.iface = Object.keys(nativeInterfaces).find(key => nativeInterfaces[key][0].mac === interfaceItem.mac);
                    return interfaceItem;
                }));
            } else {
                const consoleInterfaces = (await exec('ip a | grep -P \'^[0-9]+:\'')).stdout.trim().
                    split('\n').map(consoleInterface => ({
                        iface: consoleInterface.match(/^[0-9]+: (.*?):/)[1],
                        ip4: '',
                        ip4subnet: '',
                        ip6: '',
                        ip6subnet: '',
                        dhcp: false,
                    }));

                consoleInterfaces.forEach(consoleInterface => {
                    if (!result.find(interfaceItem => interfaceItem.iface === consoleInterface.iface)) {
                        result.push(consoleInterface);
                    }
                });

                const config = getConfig();

                result.forEach(interfaceItem => {
                    if (config[interfaceItem.iface]) {
                        interfaceItem.dhcp = config[interfaceItem.iface].dhcp;
                        interfaceItem.dns = config[interfaceItem.iface].dns || [''];
                        interfaceItem.ip4 = config[interfaceItem.iface].ip4 || '';
                        interfaceItem.ip4subnet = config[interfaceItem.iface].ip4subnet || '';
                        interfaceItem.ip6 = config[interfaceItem.iface].ip6 || '';
                        interfaceItem.ip6subnet = config[interfaceItem.iface].ip6subnet || '';
                        interfaceItem.gateway = config[interfaceItem.iface].ip4gateway || '';
                        interfaceItem.type = interfaceItem.iface[0] === 'w' ? 'wireless' : 'wired';
                    }
                });
                response(result);
            }
        });
    },
    wifi: async (input, response) => {
        if (process.platform === 'win32') {
            si.wifiNetworks(response);
        } else {
            response(await getWiFi());
        }
    },
    dns: (input, response) => {
        response(dns.getServers());
    },
    changeDns: (input, response) => {
        console.log(input.data);
    },
    wifiConnections: async (input, response) => {
        if (process.platform === 'win32') {
            si.wifiConnections(response);
        } else {
            response(await getWiFiConnections());
        }
    },
    wifiConnect: async (input, response) => {
        if (process.platform === 'win32') {
            wifi.init({
                iface: null
            });
            wifi.connect({ ssid: input.ssid, password: input.password }, error => {
                if (error) {
                    response({result: false, error: error});
                }
                response({result: true});
            });
        } else {
            await wifiConnect(input.ssid, input.password);
            try {
                response({result: (await exec('iwgetid -r')).stdout.trim() === 'input.ssid'});
            } catch {
                response({result: true});
            }
        }
    },
    wifiDisconnect: async (input, response) => {
        if (process.platform === 'win32') {
            wifi.init({
                iface: null
            });
            await wifi.disconnect(error => {
                if (error) {
                    response({result: false, error: error});
                }
                response({result: true});
            });
        } else {
            wifiDisconnect();
            response({result: true});
        }
    },
    changeInterface: async (input, response) => {
        if (process.platform === 'win32') {
            if (input.rootPassword !== 'test') {
                response(false);
            }
        } else {
            const config = getConfig();

            config[input.data.iface] = input.data.dhcp ?
                {dhcp: true}
                : {
                    dhcp: false,
                    ip4: input.data.ip4,
                    ip4subnet: input.data.ip4subnet,
                    ip6: input.data.ip6,
                    ip6subnet: input.data.ip6subnet,
                    ip4gateway: input.data.gateway,
                    dns: input.data.dns,
                };
            setConfig(config);
            await writeInterfaces();
        }
        response(true);
    },
};

/**
 * Starts the adapter instance
 * @param {Partial<utils.AdapterOptions>} [options]
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return adapter = utils.adapter(Object.assign({}, options, {
        name: adapterName,

        // The ready callback is called when databases are connected and adapter received configuration.
        // start here!
        ready: main, // Main method defined below for readability

        message: obj => {
            if (typeof obj === 'object' && obj.callback) {
                const response = result => adapter.sendTo(obj.from, obj.command, result, obj.callback);

                if (triggers[obj.command]) {
                    triggers[obj.command](obj.message, response);
                } else {
                    // error
                }
            }
        }
    }));
}

async function main() {
    try {
        if (fs.existsSync(interfacesFile)) {
            if (!fs.existsSync(interfacesFile + '.bak')) {
                fs.writeFileSync(`${interfacesFile}.bak`, fs.readFileSync(interfacesFile));
            }
        } else if (fs.existsSync('/etc/dhcp/dhclient.conf')) {
            interfacesFile = '/etc/dhcp/dhclient.conf';
            if (!fs.existsSync(interfacesFile + '.bak')) {
                fs.writeFileSync(`${interfacesFile}.bak`, fs.readFileSync(interfacesFile));
            }
        } else {
            adapter.log.warn('Cannot find DHCP file. Nether /etc/dhcp/dhclient.conf nor /etc/dhcpcd.conf exist');
            interfacesFile = null;
        }
    } catch (e) {
        adapter.log.error(`Cannot write ${interfacesFile}. Please call "sudo chown iobroker ${interfacesFile}" in shell!`)
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}
