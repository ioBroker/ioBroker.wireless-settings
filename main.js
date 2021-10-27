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

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;

const sudo = (command, password) => {
    // return childProcess.execSync(`echo ${password} | sudo -S command`).toString().trim();
    return childProcess.execSync(command).toString().trim();
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

            const newConfig = [
                { 'allow-hotplug': '' },
                { auto: 'wlan0' },
                [
                  { iface: input.data.iface + ' inet static' },
                  { address: input.data.ip4 },
                  { netmask: input.data.ip4subnet },
                  { gateway: '192.168.100.1' },
                  { 'dns-nameservers': '8.8.8.8 8.8.4.4' },
                  { 'dns-search': 'foo' },
                  { 'wpa-conf': '/etc/wpa_supplicant/wpa_supplicant.conf' }
                ]
              ];
              setInterfaces('/etc/network/interfaces.d/iobroker', newConfig, input.rootPassword);
            //   sudo('service dhcpcd stop');
            //   sudo('ifdown ' + input.data.iface);
            //   sudo('ifup ' + input.data.iface);
            //   sudo('sleep 2');
            //   sudo('ifdown ' + input.data.iface);
            //   sudo('ifup ' + input.data.iface);
            
            // childProcess.execSync(`echo ${input.rootPassword} | sudo -S ifconfig ${input.data.iface} ${input.data.ip4} netmask ${input.data.ip4subnet}`).toString().trim();
            // childProcess.execSync(`echo ${input.rootPassword} | sudo -S ifconfig ${input.data.iface} down`).toString().trim();
            // childProcess.execSync(`echo ${input.rootPassword} | sudo -S ifconfig ${input.data.iface} up`).toString().trim();
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
    sudo(`sh -c 'echo "${result}" > ${filename}'`, password);
}

async function main() {
    const config = getInterfaces('/etc/network/interfaces.d/iobroker');
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