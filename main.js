const utils = require('@iobroker/adapter-core');
const wifi = require('node-wifi');
const networkInterfaces = require('node:os').networkInterfaces;
const dns = require('node:dns');
const fs = require('node:fs');
const { Netmask } = require('netmask');
const si = require('systeminformation');
const adapterName = require('./package.json').name.split('.').pop();
// const childProcess = require('child_process');
const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);
const configFile = `${__dirname}/data/network.json`;

let stopping = false;
let cmdRunning = false;

/**
 * The adapter instance
 *
 */
let adapter;

const sudo = async command => {
    if (!stopping) {
        cmdRunning = command;
        const result = (await exec(`sudo ${command}`)).stdout.trim();
        adapter.log.debug(`Result for "SUDO ${command}": ${result}`);
        cmdRunning = false;
        return result;
    }
    return '';

    //return childProcess.execSync(`echo ${password} | sudo -S command`).toString().trim();
    // return childProcess.execSync(command).toString().trim();
};

const justExec = async command => {
    if (!stopping) {
        cmdRunning = command;
        const result = (await exec(command)).stdout.trim();
        adapter.log.debug(`Result for "${command}": ${result}`);
        cmdRunning = false;
        return result;
    }
    return '';

    // return childProcess.execSync(`echo ${password} | sudo -S command`).toString().trim();
    // return childProcess.execSync(command).toString().trim();
};

const argumentEscape = argument => {
    return `'${argument.replace(/'/, /\\'/g)}'`;
};

const getConfig = () => {
    return JSON.parse(fs.readFileSync(configFile).toString());
};

const setConfig = config => {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 4));
};

const wifiConnect = async (ssid, password, iface) => {
    const config = getConfig();
    config[iface].wifi = ssid;
    config[iface].wifiPassword = password ? adapter.encrypt(password) : '';
    setConfig(config);
    await writeWifi(iface);
    // await sudo('service wpa_supplicant restart');
    await writeInterfaces(true);
};

const wifiDisconnect = async iface => {
    const config = getConfig();
    delete config[iface].wifi;
    delete config[iface].wifiPassword;
    setConfig(config);
    await writeWifi(iface);
    if (!stopping) {
        // fs.writeFileSync(wpaSupplicantFile, wpaSupplicant);
        // await sudo('wpa_cli reconfigure');
        await writeInterfaces(true);
    }
};

const writeWifi = async iface => {
    const config = getConfig();
    const ssid = config[iface].wifi;
    const password = config[iface].wifiPassword ? adapter.decrypt(config[iface].wifiPassword) : null;
    let wpaSupplicant;
    if (ssid) {
        if (password) {
            wpaSupplicant = `
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=${config[iface].country ? config[iface].country : 'DE'}

network={
    ssid="${ssid}"
    psk="${password}"
    key_mgmt=WPA-PSK
}
`;
        } else {
            wpaSupplicant = `
            ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
            update_config=1
            country=${config[iface].country ? config[iface].country : 'DE'}
            
            network={
                ssid="${ssid}"
                key_mgmt=NONE
            }
            `;
        }
    } else {
        wpaSupplicant = `
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=${config[iface].country ? config[iface].country : 'DE'}
    `;
    }
    await justExec(`echo ${argumentEscape(wpaSupplicant)} | sudo tee /etc/wpa_supplicant/wpa_supplicant.conf`);
    await sudo(`ifconfig ${iface} down`);
    await sudo(`ifconfig ${iface} up`);
};

const writeInterfaces = async () => {
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
        const dns =
            ifaceConfig.dns && ifaceConfig.dns.join(' ').trim()
                ? `static domain_name_servers=${ifaceConfig.dns.join(' ')}`
                : '';

        interfaces += ifaceConfig.dhcp
            ? `
        `
            : `
interface ${iface}
static ip_address=${ifaceConfig.ip4}/${new Netmask(`${ifaceConfig.ip4}/${ifaceConfig.ip4subnet}`).bitmask}
static routers=${ifaceConfig.ip4gateway}
${dns}
# static ip6_address=${ifaceConfig.ip6}/${ifaceConfig.ip6subnet}
        `;
    });

    console.log(interfaces);
    if (fs.existsSync('/etc/dhcpcd.conf')) {
        await justExec(`echo ${argumentEscape(interfaces)} | sudo tee /etc/dhcpcd.conf`);

        if (!stopping) {
            // fs.writeFileSync(interfacesFile, interfaces);
            const interfaces = await consoleGetInterfaces();
            for (const k in interfaces) {
                await sudo(`ip addr flush ${interfaces[k]}`);
                if (interfaces[k].startsWith('w')) {
                    await sudo(`ifconfig ${interfaces[k]} down`);
                    await sudo(`ifconfig ${interfaces[k]} up`);
                }
            }
            await sudo('service dhcpcd restart');
        }
    }
};

const getWiFi = async () => {
    const networks = [];
    const iwlist = await sudo('iwlist scan');

    if (!stopping) {
        let currentNetwork = null;
        iwlist.split('\n').forEach(line => {
            line = line.trim();
            if (line.startsWith('Cell')) {
                currentNetwork = { security: [] };
                networks.push(currentNetwork);
            }
            let matches;
            if (currentNetwork && (matches = line.match(/^ESSID:"(.*)"/))) {
                currentNetwork.ssid = matches[1];
            }
            if (currentNetwork && (matches = line.match(/Signal level=(.*) dBm/))) {
                currentNetwork.quality = matches[1];
            }
            if (currentNetwork && line.match(/Encryption key:off/)) {
                currentNetwork.security.push('Open');
            }
            if (currentNetwork && line.match(/IE: WPA Version 1/)) {
                currentNetwork.security.push('WPA');
            }
            if (currentNetwork && line.match(/IEEE 802\.11i\/WPA2 Version 1/)) {
                currentNetwork.security.push('WPA2');
            }
        });
    }

    // Remove SSID with the same name and take the strongest one
    let changed;
    do {
        changed = false;
        for (let i = networks.length - 1; i >= 0; i--) {
            const ssid = networks[i].ssid;
            const pos = networks.findIndex((item, j) => j !== i && item.ssid === ssid);
            if (pos !== -1) {
                // find the strongest signal in the list
                let max = i;
                for (let j = 0; j < networks.length; j++) {
                    if (
                        networks[j].ssid === ssid &&
                        parseFloat(networks[j].quality) > parseFloat(networks[max].quality)
                    ) {
                        max = j;
                    }
                }
                const strongest = networks[max];
                // delete all SSID with the same name
                for (let j = networks.length - 1; j >= 0; j--) {
                    if (networks[j].ssid === ssid) {
                        networks.splice(j, 1);
                    }
                }
                networks.push(strongest);
                changed = true;
                break;
            }
        }
    } while (changed);

    return networks;
};

const getWiFiConnections = async () => {
    let ssid = null;
    try {
        ssid = await justExec('iwgetid -r');
    } catch (e) {
        adapter.log.warn(`Cannot execute "iwgetid": ${e}`);
    }
    return ssid ? [{ ssid }] : [];
};

const consoleGetInterfaces = async () =>
    (await justExec("ip a | grep -P '^[0-9]+:'"))
        .split('\n')
        .map(iface => iface.match(/^[0-9]+: (.*?):/)[1])
        .filter(iface => iface !== 'lo');

const triggers = {
    interfaces: async (input, response) => {
        si.networkInterfaces(async result => {
            if (process.platform === 'win32') {
                const nativeInterfaces = networkInterfaces();
                response(
                    result.map(interfaceItem => {
                        interfaceItem.iface = Object.keys(nativeInterfaces).find(
                            key => nativeInterfaces[key][0].mac === interfaceItem.mac,
                        );
                        return interfaceItem;
                    }),
                );
            } else {
                const consoleInterfaces = (await consoleGetInterfaces()).map(consoleInterface => ({
                    iface: consoleInterface,
                    ip4: '',
                    ip4subnet: '',
                    ip6: '',
                    ip6subnet: '',
                    gateway: '',
                    dhcp: false,
                }));

                const editable = fs.existsSync('/etc/dhcpcd.conf');

                consoleInterfaces.forEach(consoleInterface => {
                    if (!result.find(interfaceItem => interfaceItem.iface === consoleInterface.iface)) {
                        result.push(consoleInterface);
                    }
                });

                const config = getConfig();

                result.forEach(interfaceItem => {
                    if (config[interfaceItem.iface]) {
                        interfaceItem.dhcp = config[interfaceItem.iface].dhcp;
                        interfaceItem.type = interfaceItem.iface[0] === 'w' ? 'wireless' : 'wired';
                        if (!interfaceItem.dhcp) {
                            interfaceItem.dns = config[interfaceItem.iface].dns || [''];
                            interfaceItem.ip4 = config[interfaceItem.iface].ip4 || '';
                            interfaceItem.ip4subnet = config[interfaceItem.iface].ip4subnet || '';
                            // interfaceItem.ip6 = config[interfaceItem.iface].ip6 || '';
                            // interfaceItem.ip6subnet = config[interfaceItem.iface].ip6subnet || '';
                            interfaceItem.gateway = config[interfaceItem.iface].ip4gateway || '';
                        } else {
                            interfaceItem.dns = [];
                        }
                        interfaceItem.country = config[interfaceItem.iface].country;
                    }
                    interfaceItem.editable = editable;
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
    changeDns: (input /*, response*/) => {
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
            wifi.init({ iface: null });

            wifi.connect({ ssid: input.ssid, password: input.password }, error => {
                if (error) {
                    response({ result: false, error: error });
                } else {
                    response({ result: true });
                }
            });
        } else {
            await wifiConnect(input.ssid, input.password, input.iface);

            try {
                response({ result: (await justExec('iwgetid -r')) === 'input.ssid' });
            } catch {
                response({ result: true });
            }
        }
    },
    wifiDisconnect: async (input, response) => {
        if (process.platform === 'win32') {
            wifi.init({ iface: null });

            await wifi.disconnect(error => {
                if (error) {
                    response({ result: false, error: error });
                } else {
                    response({ result: true });
                }
            });
        } else {
            wifiDisconnect(input.iface);
            response({ result: true });
        }
    },
    changeInterface: async (input, response) => {
        if (process.platform === 'win32') {
            if (input.rootPassword !== 'test') {
                response(false);
            }
        } else {
            const config = getConfig();

            if (input.data.dhcp) {
                config[input.data.iface].dhcp = true;
                config[input.data.iface].country = input.data.country;
            } else {
                config[input.data.iface].dhcp = false;
                config[input.data.iface].ip4 = input.data.ip4;
                config[input.data.iface].ip4subnet = input.data.ip4subnet;
                config[input.data.iface].ip4gateway = input.data.gateway;
                config[input.data.iface].dns = input.data.dns;
                config[input.data.iface].country = input.data.country;
            }
            setConfig(config);
            if (input.data.iface[0] === 'w') {
                await writeWifi(input.data.iface);
            }
            await writeInterfaces();
        }
        response(true);
    },
};

function waitForEnd(callback, _started) {
    _started = _started || Date.now();
    if (cmdRunning && Date.now() - _started < 4000) {
        setTimeout(waitForEnd, 500, callback, _started);
    } else {
        callback && callback(Date.now() - _started >= 4000);
    }
}

/**
 * Starts the adapter instance
 *
 * @param options Adapter options
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return (adapter = utils.adapter(
        Object.assign({}, options, {
            name: adapterName,

            // The ready callback is called when databases are connected and adapter received configuration.
            // start here!
            ready: async () => {
                await main();
            },
            unload: callback => {
                stopping = true;
                adapter.setState('info.connection', false, true);
                waitForEnd(timeout => {
                    timeout && adapter.log.warn(`Timeout by waiting of command: ${cmdRunning}`);
                    callback && callback();
                });
            },
            message: obj => {
                if (typeof obj === 'object' && obj.callback) {
                    const response = result => {
                        adapter.sendTo(obj.from, obj.command, result, obj.callback);
                    };

                    if (triggers[obj.command]) {
                        triggers[obj.command](obj.message, response);
                    } else {
                        // error
                    }
                }
            },
        }),
    ));
}

async function main() {
    if (!fs.existsSync('/etc/dhcpcd.conf.bak') && fs.existsSync('/etc/dhcpcd.conf')) {
        await sudo('cp /etc/dhcpcd.conf /etc/dhcpcd.conf.bak');
    }

    if (fs.existsSync('/etc/dhcpcd.conf') || fs.existsSync('/etc/wpa_supplicant/wpa_supplicant.conf')) {
        adapter.setState('info.connection', true, true);
    }

    const interfaces = await consoleGetInterfaces();
    if (!fs.existsSync(configFile)) {
        const template = {};
        for (const k in interfaces) {
            template[interfaces[k]] = {
                dhcp: true,
            };
        }
        // create dir
        !fs.existsSync(`${__dirname}/data`) && fs.mkdirSync(`${__dirname}/data`);

        fs.writeFileSync(configFile, JSON.stringify(template, null, 2));
    }

    const config = getConfig();
    for (const k in interfaces) {
        if (!config[interfaces[k]]) {
            config[interfaces[k]] = {
                dhcp: true,
            };
            fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        }
    }
    /*try {
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

    try {
        if (fs.existsSync(wpaSupplicantFile)) {
            fs.readFileSync(wpaSupplicantFile);
        } else {
            wpaSupplicantFile = null;
        }
    } catch (e) {
        adapter.log.error(`Cannot read ${wpaSupplicantFile}. Please call "sudo chown iobroker ${wpaSupplicantFile}" in shell!`)
    }*/
}

if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}
