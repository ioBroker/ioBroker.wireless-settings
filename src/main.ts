import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import { networkInterfaces } from 'node:os';
import { getServers as getDnsServers } from 'node:dns';
import { exec } from 'node:child_process';

type ConnectionState = 'connected' | 'disconnected' | 'connecting';
interface WirelessNetwork {
    security: '--' | 'WPA' | 'WPA2';
    ssid: string;
    quality: number;
    channel: number;
    speed: string;
}

interface NetworkInterface {
    iface: string;
    ip4: string;
    ip4subnet: string;
    ip6: string;
    ip6subnet: string;
    mac: string;
    gateway: string;
    dhcp: boolean;
    dns: string[];
    type: 'ethernet' | 'loopback' | 'wifi' | 'wifi-p2p';
    editable: false;
    status: ConnectionState;
}

// Take the logic for WI-FI here
// https://github.com/RPi-Distro/raspi-config/blob/bookworm/raspi-config#L2848
/**
 * The adapter instance
 */
class NetworkSettings extends Adapter {
    private cmdRunning: string | boolean = false;
    private stopping: boolean = false;

    constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'wireless-settings',
            unload: (cb: () => void): Promise<void> => this.unload(cb),
            ready: () => this.main(),
            message: obj => {
                if (typeof obj === 'object' && obj?.callback) {
                    if (obj.command === 'interfaces') {
                        void this.onInterfaces().then(result =>
                            this.sendTo(obj.from, obj.command, result, obj.callback),
                        );
                    } else if (obj.command === 'wifi') {
                        void this.onWifi().then(result => this.sendTo(obj.from, obj.command, result, obj.callback));
                    } else if (obj.command === 'dns') {
                        this.sendTo(obj.from, obj.command, this.onDns(), obj.callback);
                    } else if (obj.command === 'wifiConnection') {
                        void this.onWifiConnection(obj.message).then(result =>
                            this.sendTo(obj.from, obj.command, result, obj.callback),
                        );
                    } else if (obj.command === 'wifiConnect') {
                        void this.onWifiConnect(obj.message).then(result =>
                            this.sendTo(obj.from, obj.command, result, obj.callback),
                        );
                    } else if (obj.command === 'wifiDisconnect') {
                        void this.onWifiDisconnect(obj.message).then(result =>
                            this.sendTo(obj.from, obj.command, result, obj.callback),
                        );
                    } else {
                        this.log.error(`Unknown command: ${obj.command}`);
                    }
                }
            },
        });
    }

    justExec(command: string): Promise<string> {
        if (!this.stopping) {
            this.cmdRunning = command;
            return new Promise((resolve, reject) => {
                try {
                    exec(command, (error, stdout, stderr) => {
                        this.cmdRunning = false;
                        if (error) {
                            this.log.error(`Cannot execute: ${error.message}`);
                            reject(error);
                        } else if (stderr) {
                            this.log.error(`Cannot execute: ${stderr}`);
                            reject(new Error(stderr));
                        } else {
                            this.log.debug(`Result for "${command}": ${stdout}`);
                            resolve(stdout.trim());
                        }
                    });
                } catch (e) {
                    this.log.error(`Cannot execute.: ${e}`);
                    reject(new Error(e));
                }
            });
        }
        return Promise.resolve('');
    }

    sudo(command: string): Promise<string> {
        return this.justExec(`sudo ${command}`);
    }

    getInterfaces(): string[] {
        const ifaces = networkInterfaces();
        return Object.keys(ifaces).filter(iface => !ifaces[iface][0].internal);
    }

    waitForEnd(callback?: (timeout: boolean) => void, _started?: number): void {
        _started = _started || Date.now();
        if (this.cmdRunning && Date.now() - _started < 4000) {
            setTimeout(() => this.waitForEnd(callback, _started), 200);
        } else if (callback) {
            callback(Date.now() - _started >= 4000);
        }
    }

    async unload(callback: () => void): Promise<void> {
        this.stopping = true;
        await this.setState('info.connection', false, true);
        this.waitForEnd(timeout => {
            timeout && this.log.warn(`Timeout by waiting of command: ${this.cmdRunning}`);
            if (callback) {
                callback();
            }
        });
    }

    async main(): Promise<void> {
        const interfaces: string[] = this.getInterfaces();
        if (interfaces.length) {
            if (process.env.CI) {
                this.log.warn('We are running in CI. Cannot check nmcli');
                return;
            }
            this.log.error(`ENV: ${JSON.stringify(process.env)}`);
            // check that nmcli is installed on a system
            try {
                await this.justExec('nmcli device status');
                await this.setState('info.connection', true, true);
            } catch (e) {
                this.log.error('This adapter is only for Raspberry Pi (5) or for systems where "nmcli" is installed');
                try {
                    const lines = await this.justExec('which nmcli');
                    if (!lines) {
                        this.log.error(
                            'Cannot find "nmcli": Please be sure that "nmcli" is installed and user "iobroker" may execute it with sudo rights',
                        );
                    } else {
                        this.log.error(`Cannot execute nmcli: ${e}`);
                    }
                } catch (e) {
                    this.log.error(`Cannot execute nmcli: ${e}`);
                }
            }
        }
    }

    static parseTable(text: string): Record<string, string>[] {
        const lines = text.split('\n');
        let header = lines.shift();
        if (!header) {
            return [];
        }
        const positions: { name: string; position: number }[] = [];
        const parts = header.split(/\s+/).filter(i => i);
        let offset = 0;
        // Get the position of each word in line
        parts.forEach((part, i) => {
            const pos = header.indexOf(part);
            positions[i] = { name: part, position: pos + offset };
            header = header.substring(pos);
            offset += pos;
            const space = header.indexOf(' ');
            if (space !== -1) {
                offset += space;
                header = header.substring(space);
            }
        });

        const result: Record<string, string>[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const obj: Record<string, string> = {};
            positions.forEach((pos: { name: string; position: number }, i) => {
                const from = pos.position;
                const to = i !== positions.length - 1 ? positions[i + 1].position : line.length;
                obj[pos.name] = line.substring(from, to).trim();
            });
            result.push(obj);
        }

        return result;
    }

    async onInterfaces(): Promise<NetworkInterface[]> {
        if (this.stopping) {
            return [];
        }
        const ifaces = networkInterfaces();
        const result: NetworkInterface[] = [];
        Object.keys(ifaces).forEach(iface => {
            const ip4 = ifaces[iface].find(addr => addr.family === 'IPv4');
            const ip6 = ifaces[iface].find(addr => addr.family === 'IPv6');
            const gateway = '';
            const dns = getDnsServers();
            const dhcp = false;
            result.push({
                iface,
                ip4: ip4?.address || '',
                ip4subnet: ip4?.netmask || '',
                ip6: ip6?.address || '',
                ip6subnet: ip6?.netmask || '',
                mac: ifaces[iface][0].mac,
                gateway,
                dns,
                dhcp,
                type: 'ethernet',
                status: 'disconnected',
                editable: false,
            });
        });
        const lines = await this.justExec('nmcli device status');
        const items = NetworkSettings.parseTable(lines);
        // DEVICE         TYPE      STATE                   CONNECTION
        // eth0           ethernet  connected               Wired connection 1
        // lo             loopback  connected (externally)  lo
        // wlan0          wifi      connected               Android12345
        // p2p-dev-wlan0  wifi-p2p  disconnected            --

        // Extract status
        for (let i = 0; i < items.length; i++) {
            const item = result.find(item => item.iface === items[i].DEVICE);
            if (item) {
                item.status = items[i].STATE.split(' ')[0] as ConnectionState;
                item.type = items[i].TYPE as 'ethernet' | 'loopback' | 'wifi' | 'wifi-p2p';
            } else if (items[i].TYPE !== 'loopback' && items[i].TYPE !== 'wifi-p2p') {
                result.push({
                    iface: items[i].DEVICE,
                    status: items[i].STATE.split(' ')[0] as ConnectionState,
                    ip4: '',
                    ip4subnet: '',
                    ip6: '',
                    ip6subnet: '',
                    mac: '',
                    gateway: '',
                    dns: [],
                    dhcp: false,
                    type: items[i].TYPE as 'ethernet' | 'loopback' | 'wifi' | 'wifi-p2p',
                    editable: false,
                });
            }
        }

        return result;
    }

    async onWifi(): Promise<WirelessNetwork[]> {
        const networks: WirelessNetwork[] = [];

        if (!this.stopping) {
            const iwlist = await this.sudo('nmcli dev wifi list --rescan yes');
            // IN-USE  BSSID              SSID                MODE   CHAN  RATE        SIGNAL  BARS  SECURITY
            // *       BA:FF:16:XX:F7:94  Android12356        Infra  6     130 Mbit/s  100     ▂▄▆█  WPA2
            //         78:FF:20:XX:5B:83  SSID 1 2         3  Infra  6     130 Mbit/s  92      ▂▄▆█  --
            //         7E:FF:20:XX:5B:83  --                  Infra  6     130 Mbit/s  89      ▂▄▆█  WPA2
            //         78:FF:20:XX:31:29  SSID 1 2         3  Infra  11    130 Mbit/s  72      ▂▄▆_  --
            //         7E:FF:20:XX:31:29  --                  Infra  11    130 Mbit/s  67      ▂▄▆_  WPA2
            //         7E:FF:20:XX:5B:83  SSID 1 2         3  Infra  48    270 Mbit/s  67      ▂▄▆_  --
            //         78:FF:58:XX:1F:1F  SSID 1 2         3  Infra  11    130 Mbit/s  59      ▂▄▆_  --
            //         18:FF:29:XX:C8:29  SSID 1 2         3  Infra  6     130 Mbit/s  55      ▂▄__  --
            //         78:FF:58:XX:1E:31  SSID 1 2         3  Infra  11    130 Mbit/s  54      ▂▄__  --
            //         1E:FF:29:XX:57:2A  --                  Infra  1     195 Mbit/s  45      ▂▄__  WPA2
            //         18:FF:29:XX:57:2A  SSID 1 2         3  Infra  1     195 Mbit/s  44      ▂▄__  --
            //         18:FF:29:XX:1D:6C  SSID 1 2         3  Infra  6     195 Mbit/s  44      ▂▄__  --
            //         7E:FF:20:XX:31:29  SSID 1 2         3  Infra  36    270 Mbit/s  44      ▂▄__  --
            //         22:FF:29:XX:57:2A  PRIVATE             Infra  1     195 Mbit/s  42      ▂▄__  WPA2
            //         18:FF:29:XX:1D:69  SSID 1 2         3  Infra  6     195 Mbit/s  37      ▂▄__  --
            //         44:FF:4A:XX:03:C4  Do5irak655767       Infra  9     65 Mbit/s   37      ▂▄__  WPA2
            //         78:FF:58:XX:1F:1A  SSID 1 2         3  Infra  6     130 Mbit/s  32      ▂▄__  --
            //         1E:FF:29:XX:1D:69  SSID 1 2         3  Infra  40    405 Mbit/s  24      ▂___  --
            //         22:FF:29:XX:1D:69  --                  Infra  40    405 Mbit/s  22      ▂___  WPA2
            // Parse information
            // Get from the first line the position of the columns
            const items: Record<string, string>[] = NetworkSettings.parseTable(iwlist);
            items.forEach(item => {
                if (item.SSID === '--') {
                    return;
                }
                networks.push({
                    security: item.SECURITY as '--' | 'WPA' | 'WPA2',
                    ssid: item.SSID,
                    quality: parseFloat(item.SIGNAL),
                    speed: item.RATE,
                    channel: parseInt(item.CHAN, 10),
                });
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
                        if (networks[j].ssid === ssid && networks[j].quality > networks[max].quality) {
                            max = j;
                        }
                    }
                    const strongest: WirelessNetwork = networks[max];
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
    }

    onDns(): string[] {
        return getDnsServers();
    }

    async onWifiConnection(input: { iface: string }): Promise<string> {
        if (this.stopping) {
            return '';
        }
        const lines = await this.justExec('nmcli device status');
        // DEVICE         TYPE      STATE                   CONNECTION
        // eth0           ethernet  connected               Wired connection 1
        // lo             loopback  connected (externally)  lo
        // wlan0          wifi      connected               Android12345
        // p2p-dev-wlan0  wifi-p2p  disconnected            --
        const items: Record<string, string>[] = NetworkSettings.parseTable(lines);

        // Extract status
        const iface = items.find(item => item.DEVICE === input.iface);
        if (iface) {
            return iface.CONNECTION;
        }
        return '';
    }

    async onWifiConnect(input: { ssid: string; password: string; iface: string }): Promise<true | string> {
        if (this.stopping) {
            return 'Instance is stopping';
        }
        try {
            let result = await this.justExec(`nmcli radio wifi`);
            if (result !== 'enabled') {
                result = await this.sudo(`nmcli radio wifi on`);
            }
            this.log.debug(`Enable radio => ${result}`);
        } catch (e) {
            this.log.error(`Cannot enable radio: ${e}`);
        }

        try {
            const result = await this.sudo(
                `nmcli device wifi connect "${input.ssid}" password "${input.password}" ifname "${input.iface}"`,
            );
            this.log.debug(`Set wifi "${input.ssid}" on "${input.iface} => ${result}`);
            if (result.includes('successfully')) {
                return true;
            }
            return result;
        } catch (e) {
            this.log.error(`Cannot connect to wifi: ${e}`);
            return `Cannot connect to wifi: ${e}`;
        }
    }

    async onWifiDisconnect(input: { ssid: string }): Promise<true | string> {
        if (this.stopping) {
            return 'Instance is stopping';
        }
        try {
            const result = await this.sudo(`nmcli connection down id "${input.ssid}"`);
            this.log.debug(`Disable wifi "${input.ssid}" => ${result}`);
            if (result.includes('successfully')) {
                return true;
            }
            return result;
        } catch (e) {
            this.log.error(`Cannot disconnect from wifi: ${e}`);
            return `Cannot disconnect from wifi: ${e}`;
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new NetworkSettings(options);
} else {
    // otherwise start the instance directly
    (() => new NetworkSettings())();
}
