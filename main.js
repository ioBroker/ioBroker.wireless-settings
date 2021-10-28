'use strict';

const utils       = require('@iobroker/adapter-core');
const axios       = require('axios');
const crypto      = require('crypto');
const network = require('network');
const wifi = require('node-wifi');
const networkInterfaces = require('os').networkInterfaces;
const dns       = require('dns');
const fs       = require('fs');
const Iconv = require('iconv').Iconv;
const si = require('systeminformation');
const si2 = require('@jedithepro/system-info');
const adapterName = require('./package.json').name.split('.').pop();
const childProcess = require('child_process');

const interfacesFile = '/etc/network/interfaces.d/iobroker';

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;

const sudo = (command, password) => {
    //return childProcess.execSync(`echo ${password} | sudo -S command`).toString().trim();
    return childProcess.execSync(`sudo ${command}`).toString().trim();
    // return childProcess.execSync(command).toString().trim();
};




function getInterfaces(filename) {
    const text = fs.readFileSync(filename).toString();
    const lines = text.split(/\r?\n/);
    const result = [];
    let currentInterface = null;
    for (const i in lines) {
        let line = lines[i];
        line = line.trim();
        if (line.startsWith('#')) {
            continue;
        }
        const matches = line.match(/^([a-z0-9\-_]+)(\s+(.*))?$/);
        if (matches) {
            const record = {};
            record[matches[1]] = matches[3] !== undefined ? matches[3] : '';
            if (matches[1] === 'auto') {
                currentInterface = null;
            }
            if (matches[1] === 'iface') {
                currentInterface = [];
                result.push(currentInterface);
            }
            if (currentInterface) {
                currentInterface.push(record);
            } else {
                result.push(record);
            }
        }
    }
    return result;
}

function getInterface(iface) {
    return getInterfaces(interfacesFile).find(interfaceItem =>
        Array.isArray(interfaceItem) && interfaceItem.find(record => record.iface && record.iface.startsWith(iface))
    );
}

function getInterfaceRecord(iface, name) {
    const interfaceItem = getInterface(iface);
    let record;
    if (interfaceItem) {
        record = getInterface(iface).find(record => record[name] !== undefined);
    }
    if (record) {
        return record[name];
    }
}

function setInterfaces(filename, data, password) {
    let result = '';
    for (const i in data) {
        const record = data[i];
        if (Array.isArray(record)) {
            for (const key in record) {
                const ifaceRecord = record[key];
                if (Object.keys(ifaceRecord)[0] !== 'iface') {
                    result += '    ';
                }
                result += `${Object.keys(ifaceRecord)[0]} ${Object.values(ifaceRecord)[0]}\n`;
            }
        } else {
            result += `${Object.keys(record)[0]} ${Object.values(record)[0]}\n`;
        }
    }
    childProcess.execSync(`echo "${result}" | sudo tee ${filename}`).toString().trim();
}

const triggers = {
    interfaces: (input, response) => {
        si.networkInterfaces(result => {
            if (process.platform === 'win32') {
                const nativeInterfaces = networkInterfaces();
                response(result.map(interfaceItem => {
                    interfaceItem.iface = Object.keys(nativeInterfaces).find(key => nativeInterfaces[key][0].mac === interfaceItem.mac);
                    return interfaceItem;
                }));
            } else {
                const consoleInterfaces = childProcess.execSync('ip a | grep -P \'^[0-9]+:\'').toString().trim().
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
                result.forEach(interfaceItem => {
                    interfaceItem.dns = getInterfaceRecord(interfaceItem.iface, 'dns-nameservers') ? getInterfaceRecord(interfaceItem.iface, 'dns-nameservers').split(/\s/) : [];
                    interfaceItem.gateway = getInterfaceRecord(interfaceItem.iface, 'gateway') || '';
                    interfaceItem.dhcp = getInterfaceRecord(interfaceItem.iface, 'iface') && getInterfaceRecord(interfaceItem.iface, 'iface').includes(' dhcp') || false;
                    interfaceItem.type = interfaceItem.iface[0] === 'w' ? 'wireless' : 'wired';
                });
                response(result);
            }
        });
    },
    wifi: (input, response) => {
        si.wifiNetworks(response);
    },
    dns: (input, response) => {
        response(dns.getServers());
    },
    changeDns: (input, response) => {
        console.log(input.data);
    },
    wifiConnections: (input, response) => {
        si.wifiConnections(response);
    },
    wifiConnect: (input, response) => {
        wifi.init({
            iface: null
        });
        wifi.connect({ ssid: input.ssid, password: input.password }, error => {
            if (error) {
                response({result: false, error: error});
            }
            response({result: true});
        });
    },
    wifiDisconnect: (input, response) => {
        if (process.platform === 'win32') {
            wifi.init({
                iface: null
            });
            wifi.disconnect(error => {
                if (error) {
                    response({result: false, error: error});
                }
                response({result: true});
            });
        } else {
            const ssid = childProcess.execSync('iwgetid -r').toString().trim();
            childProcess.execSync(`nmcli c down '${ssid}'`);
            response({result: true});
        }
    },
    changeInterface: (input, response) => {
        if (process.platform === 'win32') {
            if (input.rootPassword !== 'test') {
                response(false);
            }
        } else {
            console.log(input);

            const wireless = input.data.iface[0] === 'w';

            const newConfig = input.data.dhcp ?
                [
                    { 'allow-hotplug': input.data.iface },
                    { auto: 'wlan0' },
                    [
                        { iface: input.data.iface + ' inet dhcp' },
                    ]
                ]
                : [
                    { 'allow-hotplug': input.data.iface },
                    { auto: input.data.iface },
                    [
                        { iface: input.data.iface + ' inet static' },
                        { address: input.data.ip4 },
                        { netmask: input.data.ip4subnet },
                        { gateway: '192.168.100.1' },
                        { 'dns-nameservers': input.data.dns.join(' ') },
                        { 'dns-search': 'foo' },
                    ]
                ];
            if (wireless) {
                newConfig.push(
                    { 'wpa-conf': '/etc/wpa_supplicant/wpa_supplicant.conf' }
                );
            }
            let found = false;
            const config = getInterfaces(interfacesFile);
            for (const i in config) {
                if (Array.isArray(config[i]) && config[i].find(record => record.iface && record.iface.startsWith(input.data.iface))) {
                    found = i;
                    break;
                }
            }
            if (found !== false) {
                config[found] = newConfig;
            } else {
                config.push(newConfig);
            }
            console.log(JSON.stringify(config, null, 4));
            //setInterfaces(interfacesFile, newConfig, input.rootPassword);
            //sudo('/etc/init.d/networking restart');
            //sudo('service dhcpcd stop');
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
    const config = getInterfaces(interfacesFile);
    console.log(config);
    //setInterfaces(__dirname + '/interfaces.example.output.txt', config);

    // console.log(networkInterfaces());
    // si.networkInterfaces(console.log);
    // si2.networkInterfaces(console.log);

    //console.log(childProcess.execSync('ip a | grep -P \'^[0-9]+:\'').toString().trim())
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}