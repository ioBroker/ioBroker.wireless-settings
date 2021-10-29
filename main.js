'use strict';

const utils       = require('@iobroker/adapter-core');
const wifi = require('node-wifi');
const networkInterfaces = require('os').networkInterfaces;
const dns       = require('dns');
const fs       = require('fs');
const si = require('systeminformation');
const adapterName = require('./package.json').name.split('.').pop();
const childProcess = require('child_process');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const configFile = __dirname + '/data/network.json';
const configTemplateFile = __dirname + '/data/network.template.json';
const interfacesFile = '/etc/network/interfaces.d/iobroker';

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

const argumentEscape = (argument) => {
    return '\'' + argument.replace(/'/, /\\'/g) + '\'';
};

const getConfig = () => {
    if (!fs.existsSync(configFile)) {
        fs.copyFileSync(configTemplateFile, configFile);
    }
    return JSON.parse(fs.readFileSync(configFile).toString());
};

const setConfig = (config) => {
    if (!fs.existsSync(configFile)) {
        fs.copyFileSync(configTemplateFile, configFile);
    }
    fs.writeFileSync(configFile, JSON.stringify(config, null, 4));
};

const wifiConnect = async (ssid, password) => {
    const config = getConfig();
    config.wlan0.wifi = ssid;
    config.wlan0.wifiPassword = password ? true : false;
    setConfig(config);
    if (password) {
        await exec(`sudo wpa_passphrase ${argumentEscape(ssid)} ${argumentEscape(password)} | sudo tee /etc/wpa_supplicant/wpa_supplicant.conf`);
    } else {
        const wpaSupplicant = `
network={
    ssid="${ssid}"
    key_mgmt=NONE
}
`;
        await exec(`echo ${argumentEscape(wpaSupplicant)} | sudo tee /etc/wpa_supplicant/wpa_supplicant.conf`);
    }
    await writeInterfaces(true);
};

const wifiDisconnect = async () => {
    const config = getConfig();
    delete config.wlan0.wifi;
    delete config.wlan0.wifiPassword;
    setConfig(config);
    await exec(`echo '' | sudo tee /etc/wpa_supplicant/wpa_supplicant.conf`);
    await writeInterfaces(true);
};

const writeInterfaces = async (wifiOnly) => {
    const config = getConfig();
    let interfaces = `
#auto lo
#iface lo inet loopback
`;

    interfaces += config['eth0'].dhcp ? `
#auto eth0
allow-hotplug eth0
iface eth0 inet dhcp
#dns-nameservers 8.8.8.8 8.8.4.4
` : `
#auto eth0
allow-hotplug eth0
iface eth0 inet static
address ${config['eth0'].ip4}
netmask ${config['eth0'].ip4subnet}
gateway ${config['eth0'].ip4gateway}
dns-nameservers ${config['eth0'].dns.join(' ')}
`;

    const wifiString = config.wlan0.wifi || true ? 'wpa-conf /etc/wpa_supplicant/wpa_supplicant.conf' : '';

    interfaces += config['wlan0'].dhcp ? `
auto wlan0
allow-hotplug wlan0
iface wlan0 inet dhcp
#dns-nameservers 8.8.8.8 8.8.4.4
${wifiString}
` : `
auto wlan0
allow-hotplug wlan0
iface wlan0 inet static
address ${config['wlan0'].ip4}
netmask ${config['wlan0'].ip4subnet}
gateway ${config['wlan0'].ip4gateway}
dns-nameservers ${config['wlan0'].dns.join(' ')}
${wifiString}
`;
    console.log(interfaces);
    await exec(`echo ${argumentEscape(interfaces)} | sudo tee ${interfacesFile}`);

    if (false && wifiOnly) {
        await sudo('ifdown wlan0');
        await sudo('ifup wlan0');
    } else {
        await sudo('service networking restart');
    }
    await sudo('service dhcpcd stop');
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
        if (matches = line.match(/^ESSID:"(.*)"/)) {
            currentNetwork.ssid = matches[1];
        }
        if (matches = line.match(/Encryption key:off/)) {
            currentNetwork.security.push('Open');
        }
        if (matches = line.match(/IE: WPA Version 1/)) {
            currentNetwork.security.push('WPA');
        }
        if (matches = line.match(/IEEE 802\.11i\/WPA2 Version 1/)) {
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
    return ssid ? [{ssid: ssid}] : [];
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
                        interfaceItem.gateway = config[interfaceItem.iface].ip4gateway || '';
                        interfaceItem.type = interfaceItem.iface[0] === 'w' ? 'wireless' : 'wired';
                    }
                });
                console.log(result);
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
            response({result: (await exec('iwgetid -r')).stdout.trim() === 'input.ssid'});
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
            console.log(input);

            const config = getConfig();

            config[input.data.iface] = input.data.dhcp ?
                {dhcp: true}
                : {
                    dhcp: false,
                    ip4: input.data.ip4,
                    ip4subnet: input.data.ip4subnet,
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

        message: (obj) => {
            if (typeof obj === 'object' && obj.callback) {
                const response = (result) => adapter.sendTo(obj.from, obj.command, result, obj.callback);

                triggers[obj.command](obj.message, response);
            }
        }

    }));
}

async function main() {
    console.log(getWiFi());
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}