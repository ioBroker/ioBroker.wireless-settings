'use strict';

const utils       = require('@iobroker/adapter-core');
const axios       = require('axios');
const crypto      = require('crypto');
const network = require('network');
const wifi = require('node-wifi');
const networkInterfaces = require('os').networkInterfaces;
const dns       = require('dns');
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
                })
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
            let ssid = childProcess.execSync('iwgetid -r').toString().trim();
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
            childProcess.execSync(`echo ${input.rootPassword} | sudo -S ifconfig ${input.data.iface} ${input.data.ip4} netmask ${input.data.ip4subnet}`).toString().trim();
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

async function main() {
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