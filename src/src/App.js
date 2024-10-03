import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { enqueueSnackbar, SnackbarProvider } from 'notistack';

import {
    AppBar,
    Tabs,
    Tab,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    FormControlLabel,
    IconButton,
    Tooltip,
    Switch,
    LinearProgress,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    CircularProgress, InputAdornment,
} from '@mui/material';
import {
    SettingsInputComponent as SettingsInputComponentIcon,
    Wifi as WifiIcon,
    Visibility,
    VisibilityOff,
    SignalWifi1Bar as SignalWifi1BarIcon,
    SignalWifi1BarLock as SignalWifi1BarLockIcon,
    SignalWifi2Bar as SignalWifi2BarIcon,
    SignalWifi2BarLock as SignalWifi2BarLockIcon,
    SignalWifi3Bar as SignalWifi3BarIcon,
    SignalWifi3BarLock as SignalWifi3BarLockIcon,
    SignalWifi4Bar as SignalWifi4BarIcon,
    SignalWifi4BarLock as SignalWifi4BarLockIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Cancel as IconCancel,
} from '@mui/icons-material';

import { Loader, I18n, GenericApp } from '@iobroker/adapter-react-v5';

import countries from './countries.json';
import enLang from './i18n/en.json';
import deLang from './i18n/de.json';
import ruLang from './i18n/ru.json';
import ptLang from './i18n/pt.json';
import nlLang from './i18n/nl.json';
import frLang from './i18n/fr.json';
import itLang from './i18n/it.json';
import esLang from './i18n/es.json';
import plLang from './i18n/pl.json';
import ukLang from './i18n/uk.json';
import zhLang from './i18n/zh-cn.json';

const styles = {
    root: {},
    tabContent: {
        padding: 10,
        overflow: 'auto',
        height: 'calc(100% - 64px)',
    },
    tabContainer: {
        display: 'flex',
    },
    buttonIcon: {
        marginLeft: 10,
    },
    gridItem: {
        width: '50%',
        maxWidth: 500,
    },
    input: {
        display: 'block',
        marginBottom: 10,
    },
    select: {
        width: 200,
    },
};

const ipValidate = (ip, isMask) => {
    let result;
    const matches = (ip || '').match(/^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/);
    if (!matches) {
        result = false;
    } else {
        result = !matches.slice(1).find(el => parseInt(el) < 0 || parseInt(el) > 255);

        if (isMask && result) {
            // eslint-disable-next-line no-bitwise
            result = (
                0x100000000 +
                (parseInt(matches[1], 10) << 24) +
                (parseInt(matches[2], 10) << 16) +
                (parseInt(matches[3], 10) << 8) +
                parseInt(matches[4], 10)
            )
                .toString(2)
                .match(/^1+0+$/);
            if (result && !parseInt(matches[1], 10)) {
                result = false;
            }
        }
    }

    return result;
};

const getWiFiIcon = (open, quality) => {
    const style = { marginRight: 8 };

    if (quality > -67) {
        return open ? <SignalWifi4BarIcon style={style} /> : <SignalWifi4BarLockIcon style={style} />;
    }
    if (quality > -70) {
        return open ? <SignalWifi3BarIcon style={style} /> : <SignalWifi3BarLockIcon style={style} />;
    }
    if (quality > -80) {
        return open ? <SignalWifi2BarIcon style={style} /> : <SignalWifi2BarLockIcon style={style} />;
    }
    return open ? <SignalWifi1BarIcon style={style} /> : <SignalWifi1BarLockIcon style={style} />;
};

class App extends GenericApp {
    constructor(props) {
        const extendedProps = {};
        extendedProps.translations = {
            en: enLang,
            de: deLang,
            ru: ruLang,
            pt: ptLang,
            nl: nlLang,
            fr: frLang,
            it: itLang,
            es: esLang,
            pl: plLang,
            uk: ukLang,
            'zh-cn': zhLang,
        };
        extendedProps.doNotLoadAllObjects = true;
        extendedProps.adapterName = 'network-settings';
        extendedProps.socket = {
            host: '192.168.100.2',
            port: 8081,
        };

        super(props, extendedProps);

        Object.assign(this.state, {
            tabValue: window.localStorage.getItem(`network.${this.instance}.tab`) || '',
            interfaces: null,
            interfacesChanged: [],
            wifi: [],
            dns: [],
            wifiConnections: [],
            sudoDialog: false,
            sudoDialogPassword: '',
            wifiDialog: false,
            wifiDialogPassword: '',
            scanWifi: false,
            processing: false,
            firstRequest: 0,
            scanning: false,
            timeout: false,
        });

        this.pendingWifiInterval = null;
        this.scanWifiInterval = null;
    }

    componentWillUnmount() {
        if (this.pendingWifiInterval) {
            clearInterval(this.pendingWifiInterval);
            this.pendingWifiInterval = null;
        }

        if (this.scanWifiTimer) {
            clearTimeout(this.scanWifiTimer);
            this.scanWifiTimer = null;
        }
    }

    async onConnectionReady() {
        await this.refresh();
    }

    refreshWiFi = () => {
        let wifiConnectionsLocal = null;
        if (this.scanWifiTimer) {
            clearTimeout(this.scanWifiTimer);
            this.scanWifiTimer = null;
        }

        return new Promise(resolve => {
            let timer = setTimeout(() => {
                if (timer) {
                    timer = 0;
                    this.setState({ timeout: true });
                    if (this.state.scanWifi) {
                        this.scanWifiTimer = setTimeout(() => {
                            this.scanWifiTimer = null;
                            this.refreshWiFi();
                        }, 4000);
                    }
                    resolve();
                }
            }, 15000);

            this.setState({ scanning: true }, () => {
                this.socket
                    .sendTo(`network-settings.${this.instance}`, 'wifiConnections', null)
                    .then(wifiConnections => {
                        wifiConnectionsLocal = wifiConnections;
                        this.setState({ wifiConnections });
                        return this.socket.sendTo(`network-settings.${this.instance}`, 'wifi', null);
                    })
                    .then(wifi => {
                        if (timer) {
                            clearTimeout(timer);
                            timer = null;
                        }

                        if (wifi.length) {
                            wifi = wifi
                                .filter(wifiNetwork => wifiNetwork.ssid.trim() !== '')
                                .sort((a, b) => {
                                    const connectedA = !!(
                                        wifiConnectionsLocal.length && a.ssid === wifiConnectionsLocal[0].ssid
                                    );
                                    const connectedB = !!(
                                        wifiConnectionsLocal.length && b.ssid === wifiConnectionsLocal[0].ssid
                                    );
                                    if (connectedA) {
                                        return -1;
                                    }
                                    if (connectedB) {
                                        return 1;
                                    }
                                    return b.quality - a.quality;
                                });
                            this.setState({ wifi, scanning: false, timeout: false }, () => resolve());
                        } else {
                            this.setState({ scanning: false, timeout: false }, () => resolve());
                        }

                        if (this.state.scanWifi) {
                            this.scanWifiTimer = setTimeout(() => {
                                this.scanWifiTimer = null;
                                this.refreshWiFi();
                            }, 4000);
                        }
                    });
            });
        });
    };

    refresh() {
        if (this.state.firstRequest === 0) {
            this.setState({ firstRequest: 1 });
        }
        return this.socket
            .sendTo(`network-settings.${this.instance}`, 'interfaces', null)
            .then(interfaces => {
                interfaces.sort((item1, item2) => (item1.mac > item2.mac ? -1 : 1));
                interfaces.sort((item1, item2) =>
                    item1.type === 'wired' && item2.type === 'wired' ? 0 : item1.type === 'wired' ? -1 : 1,
                );
                interfaces.sort((item1, item2) => (!item1.virtual && !item2.virtual ? 0 : !item1.virtual ? -1 : 1));
                interfaces = interfaces.filter(interfaceItem => interfaceItem.ip4 !== '127.0.0.1');
                interfaces = interfaces.map(interfaceItem => {
                    if (typeof interfaceItem.dhcp === 'string') {
                        interfaceItem.dhcp = JSON.parse(interfaceItem.dhcp);
                    }

                    return interfaceItem;
                });
                let tabValue = this.state.tabValue;
                if (!interfaces.find(i => i.iface)) {
                    tabValue = interfaces[0]?.iface || '';
                }

                this.setState({
                    tabValue,
                    interfaces,
                    interfacesChanged: JSON.parse(JSON.stringify(interfaces)),
                });

                return this.refreshWiFi();
            })
            .then(() => this.socket.sendTo(`network-settings.${this.instance}`, 'dns', null))
            .then(dns => this.setState({ dns, firstRequest: 2 }));
    }

    setInterfaceParam = (index, param, value) => {
        const interfacesChanged = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfacesChanged[index][param] = value;
        this.setState({ interfacesChanged });
    };

    setDns = (interfaceIndex, dnsIndex, value) => {
        const interfacesChanged = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfacesChanged[interfaceIndex].dns[dnsIndex] = value;
        this.setState({ interfacesChanged });
    };

    addDns = interfaceIndex => {
        const interfacesChanged = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfacesChanged[interfaceIndex].dns.push('');
        this.setState({ interfacesChanged });
    };

    removeDns = (interfaceIndex, dnsIndex) => {
        const interfacesChanged = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfacesChanged[interfaceIndex].dns.splice(dnsIndex, 1);
        this.setState({ interfacesChanged });
    };

    getSelectedTab() {
        return this.state.selectedTab ? this.state.selectedTab : '0';
    }

    sendData = (index, password) => {
        this.setState({ processing: true });
        this.socket
            .sendTo(`network-settings.${this.instance}`, 'changeInterface', {
                rootPassword: password,
                data: this.state.interfacesChanged[index],
            })
            .then(result => {
                this.setState({ processing: false });
                if (result) {
                    enqueueSnackbar(I18n.t('Interface updated'), { variant: 'success' });
                    this.refresh();
                } else {
                    enqueueSnackbar(I18n.t('Interface not updated'), { variant: 'error' });
                }
            });

        if (
            window.location.hostname === this.state.interfaces[index].ip4 &&
            this.state.interfacesChanged[index].ip4 !== this.state.interfaces[index].ip4
        ) {
            window.location.href = `${window.location.protocol}://${this.state.interfacesChanged[index].ip4}:${window.location.port}`;
        }
    };

    connect = (ssid, password, country) => {
        this.setState({ processing: true });
        return this.socket
            .sendTo(`network-settings.${this.instance}`, 'wifiConnect', {
                ssid,
                password,
                iface: this.state.tabValue,
                country,
            })
            .then(() => {
                this.refreshWiFi();
                const startTime = Date.now();

                this.pendingWifiInterval = setInterval(() => {
                    if (this.state.wifiConnections.length && ssid === this.state.wifiConnections[0].ssid) {
                        enqueueSnackbar(`${ssid} ${I18n.t('connected')}`, { variant: 'success' });
                        clearInterval(this.pendingWifiInterval);
                        this.pendingWifiInterval = null;
                        this.refresh().then(() => this.setState({ processing: false }));
                    } else if (Date.now() - startTime > 40 * 1000) {
                        enqueueSnackbar(`${ssid} ${I18n.t('not connected')}`, { variant: 'error' });
                        clearInterval(this.pendingWifiInterval);
                        this.pendingWifiInterval = null;
                        this.refresh().then(() => this.setState({ processing: false }));
                    } else {
                        this.refreshWiFi();
                    }
                }, 1000);
            });
    };

    disconnect = () => {
        this.setState({ processing: true });

        return this.socket
            .sendTo(`network-settings.${this.instance}`, 'wifiDisconnect', {
                iface: this.state.tabValue,
                ssid: this.state.wifiConnections[0]?.ssid || '',
            })
            .then(() => {
                this.refreshWiFi();
                const startTime = Date.now();
                this.pendingWifiInterval = setInterval(() => {
                    if (this.state.wifiConnections.length === 0) {
                        enqueueSnackbar(I18n.t('WI-FI disconnected'), { variant: 'success' });
                        clearInterval(this.pendingWifiInterval);
                        this.pendingWifiInterval = null;
                        this.refresh().then(() => this.setState({ processing: false }));
                    } else if (Date.now() - startTime > 40 * 1000) {
                        enqueueSnackbar(I18n.t('WI-FI disconnected'), { variant: 'error' });
                        clearInterval(this.pendingWifiInterval);
                        this.pendingWifiInterval = null;
                        this.refresh().then(() => this.setState({ processing: false }));
                    } else {
                        this.refreshWiFi();
                    }
                }, 1000);
            });
    };

    renderRootDialog() {
        return (
            <Dialog
                open={this.state.sudoDialog !== false}
                onClose={() =>
                    this.setState({
                        sudoDialog: false,
                        sudoDialogPassword: '',
                    })
                }
            >
                <DialogTitle>{I18n.t('Enter sudo password')}</DialogTitle>
                <DialogContent>
                    <TextField
                        variant="standard"
                        value={this.state.sudoDialogPassword}
                        onChange={e => this.setState({ sudoDialogPassword: e.target.value })}
                        type="password"
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!this.state.sudoDialogPassword}
                        onClick={() => {
                            this.sendData(this.state.sudoDialog, this.state.sudoDialogPassword);
                            this.setState({
                                sudoDialog: false,
                                sudoDialogPassword: '',
                            });
                        }}
                    >
                        {I18n.t('Send')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() =>
                            this.setState({
                                sudoDialog: false,
                                sudoDialogPassword: '',
                            })
                        }
                        startIcon={<IconCancel />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderWifiDialog() {
        return (
            <Dialog
                open={this.state.wifiDialog !== false}
                onClose={() =>
                    this.setState({
                        wifiDialog: false,
                        wifiDialogPassword: '',
                    })
                }
            >
                <DialogTitle>{I18n.t('Enter WI-FI password')}</DialogTitle>
                <DialogContent>
                    <TextField
                        style={{ minWidth: 250 }}
                        fullWidth
                        variant="standard"
                        value={this.state.wifiDialogPassword}
                        onChange={e => this.setState({ wifiDialogPassword: e.target.value })}
                        slotProps={{
                            input: {
                                endAdornment: this.state.wifiDialogPassword ? (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={() =>
                                                this.setState({ wifiPasswordVisible: !this.state.wifiPasswordVisible })
                                            }
                                        >
                                            {this.state.wifiPasswordVisible ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                ) : null,
                            },
                        }}
                        type={this.state.wifiPasswordVisible ? 'text' : 'password'}
                        label={I18n.t('WI-FI password')}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!this.state.wifiDialogPassword}
                        onClick={() => {
                            const interfaceItem = this.state.interfacesChanged.find(item => item.iface === this.state.tabValue);
                            this.connect(this.state.wifiDialog, this.state.wifiDialogPassword, interfaceItem?.country);
                            this.setState({
                                wifiDialog: false,
                                wifiPasswordVisible: false,
                                wifiDialogPassword: '',
                            });
                        }}
                    >
                        {I18n.t('Apply')}
                    </Button>
                    <Button
                        color="grey"
                        variant="contained"
                        onClick={() =>
                            this.setState({
                                wifiDialog: false,
                                wifiPasswordVisible: false,
                                wifiDialogPassword: '',
                            })
                        }
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    startsWifiScan(enabled, cb) {
        if (enabled === true) {
            this.setState({ scanWifi: true }, () => {
                this.refreshWiFi();
                cb && cb();
            });
        } else if (enabled === false) {
            if (this.scanWifiTimer) {
                clearTimeout(this.scanWifiTimer);
                this.scanWifiTimer = null;
            }
            this.setState({ scanWifi: false }, () => cb && cb());
        } else {
            this.startsWifiScan(!this.state.scanWifi, cb);
        }
    }

    renderInterface(interfaceItem, i) {
        let saveEnabled;
        let ipValid = true;
        let maskValid = true;
        let gatewayValid = true;

        if (!interfaceItem) {
            return null;
        }

        if (!interfaceItem.dhcp) {
            ipValid = ipValidate(interfaceItem.ip4);
            maskValid = ipValidate(interfaceItem.ip4subnet, true);
            gatewayValid = ipValidate(interfaceItem.gateway);

            saveEnabled = ipValid && maskValid && gatewayValid;
            if (saveEnabled) {
                if (interfaceItem.dhcp !== this.state.interfaces[i].dhcp) {
                    saveEnabled = true;
                } else {
                    saveEnabled =
                        interfaceItem.ip4 !== this.state.interfaces[i].ip4 ||
                        interfaceItem.ip4subnet !== this.state.interfaces[i].ip4subnet ||
                        interfaceItem.gateway !== this.state.interfaces[i].gateway ||
                        JSON.stringify(interfaceItem.dns) !== JSON.stringify(this.state.interfaces[i].dns) ||
                        interfaceItem.country !== this.state.interfaces[i].country;
                }
            }
        } else {
            saveEnabled = interfaceItem.dhcp !== this.state.interfaces[i].dhcp;
        }

        return (
            <>
                <div style={{ display: 'flex', gap: 32 }}>
                    <div>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    disabled={this.state.processing || !interfaceItem.editable}
                                    checked={interfaceItem.dhcp}
                                    onChange={e => {
                                        if (e.target.checked) {
                                            this.setInterfaceParam(i, 'ip4', this.state.interfaces[i].ip4);
                                            this.setInterfaceParam(i, 'ip4subnet', this.state.interfaces[i].ip4subnet);
                                            this.setInterfaceParam(i, 'gateway', this.state.interfaces[i].gateway);
                                        }
                                        this.setInterfaceParam(i, 'dhcp', e.target.checked);
                                    }}
                                />
                            }
                            label={I18n.t('DHCP')}
                        />
                        <>
                            {interfaceItem.type === 'wireless' ? (
                                <>
                                    <h4>WI-FI</h4>
                                    <FormControl variant="standard">
                                        <InputLabel>{I18n.t('Country')}</InputLabel>
                                        <Select
                                            variant="standard"
                                            style={styles.select}
                                            value={interfaceItem.country || 'DE'}
                                            onChange={e => this.setInterfaceParam(i, 'country', e.target.value)}
                                        >
                                            {Object.keys(countries)
                                                .sort((code1, code2) => (countries[code1] > countries[code2] ? 1 : -1))
                                                .map(code => (
                                                    <MenuItem
                                                        key={code}
                                                        value={code}
                                                    >
                                                        {countries[code]}
                                                    </MenuItem>
                                                ))}
                                        </Select>
                                    </FormControl>
                                </>
                            ) : null}
                            <h4>IPv4</h4>
                            <TextField
                                variant="standard"
                                style={styles.input}
                                value={interfaceItem.ip4}
                                error={!ipValid}
                                label="IPv4"
                                onChange={e => this.setInterfaceParam(i, 'ip4', e.target.value)}
                                disabled={interfaceItem.dhcp || !interfaceItem.editable}
                                helperText={!ipValid ? I18n.t('Invalid IP address') : ''}
                            />
                            <TextField
                                variant="standard"
                                style={styles.input}
                                value={interfaceItem.ip4subnet}
                                error={!maskValid}
                                label="IPv4 netmask"
                                onChange={e => this.setInterfaceParam(i, 'ip4subnet', e.target.value)}
                                disabled={interfaceItem.dhcp || !interfaceItem.editable}
                                helperText={!maskValid ? I18n.t('Invalid netmask') : ''}
                            />
                            <TextField
                                variant="standard"
                                style={styles.input}
                                value={interfaceItem.gateway}
                                error={!gatewayValid}
                                label={I18n.t('Default gateway')}
                                onChange={e => this.setInterfaceParam(i, 'gateway', e.target.value)}
                                disabled={interfaceItem.dhcp || !interfaceItem.editable}
                                helperText={!gatewayValid ? I18n.t('Invalid default gateway') : ''}
                            />
                            <h4>IPv6</h4>
                            <TextField
                                variant="standard"
                                style={styles.input}
                                value={interfaceItem.ip6}
                                label="IPv6"
                                disabled
                            />
                            <TextField
                                variant="standard"
                                value={interfaceItem.ip6subnet}
                                label="IPv6 netmask"
                                disabled
                            />
                            <h4>DNS</h4>
                        </>
                        {interfaceItem.dns &&
                            interfaceItem.dns.map((dnsRecord, dnsI) => (
                                <div key={dnsI}>
                                    <TextField
                                        variant="standard"
                                        value={dnsRecord}
                                        label={I18n.t('DNS record')}
                                        onChange={e => this.setDns(i, dnsI, e.target.value)}
                                        disabled={interfaceItem.dhcp || !interfaceItem.editable}
                                    />
                                    {interfaceItem.editable &&
                                    !interfaceItem.dhcp &&
                                    interfaceItem.dns &&
                                    interfaceItem.dns.length > 1 ? (
                                        <IconButton onClick={() => this.removeDns(i, dnsI)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    ) : null}
                                </div>
                            ))}
                        {interfaceItem.editable && !interfaceItem.dhcp ? (
                            <IconButton
                                onClick={() => this.addDns(i)}
                                title={I18n.t('Add DNS record')}
                            >
                                <AddIcon />
                            </IconButton>
                        ) : null}
                        {interfaceItem.editable && !interfaceItem.dhcp ? <br /> : null}
                        {interfaceItem.editable ? (
                            <Button
                                variant="contained"
                                color="primary"
                                disabled={!saveEnabled || this.state.processing}
                                onClick={() => this.sendData(i, '')}
                            >
                                {I18n.t('Save')}
                            </Button>
                        ) : null}
                    </div>
                    {interfaceItem.type === 'wired' ? null : (
                        <div>
                            {this.state.processing || this.state.firstRequest < 2 ? <LinearProgress /> : null}
                            <FormControlLabel
                                control={
                                    <Switch
                                        disabled={this.state.processing}
                                        checked={this.state.scanWifi}
                                        onChange={() => this.startsWifiScan()}
                                    />
                                }
                                label={
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        {I18n.t('WI-FI scan')}
                                        {this.state.scanning ? (
                                            <CircularProgress size={22} />
                                        ) : this.state.timeout ? (
                                            I18n.t('timeout')
                                        ) : null}
                                    </div>
                                }
                            />
                            {this.renderWifi()}
                        </div>
                    )}
                </div>
                {/* <pre>
                 {interfaceItem.type === 'wireless'
                    ? JSON.stringify(this.state.wifi, null, 2) + JSON.stringify(this.state.wifiConnections, null, 2)
                    : null}
                 {JSON.stringify(interfaceItem, null, 2)}
            </pre> */}
            </>
        );
    }

    renderWifi() {
        return this.state.wifi.map((wifi, i) => {
            const connected = !!(this.state.wifiConnections.length && wifi.ssid === this.state.wifiConnections[0].ssid);
            return (
                <div key={i}>
                    <Button
                        variant={connected ? 'contained' : undefined}
                        color={connected ? 'primary' : 'grey'}
                        disabled={connected || this.state.processing}
                        title={connected ? '' : I18n.t('Click to connect')}
                        onClick={() =>
                            this.startsWifiScan(false, () => {
                                if (wifi.security.includes('Open')) {
                                    const interfaceItem = this.state.interfacesChanged.find(item => item.iface === this.state.tabValue);
                                    this.connect(wifi.ssid, '', interfaceItem?.country);
                                } else {
                                    this.setState({ wifiDialog: wifi.ssid });
                                }
                            })
                        }
                    >
                        <Tooltip title={`${wifi.quality} dBm`}>
                            {getWiFiIcon(wifi.security.includes('Open'), parseInt(wifi.quality))}
                        </Tooltip>
                        {wifi.ssid}
                    </Button>
                    {connected ? (
                        <Button
                            color="grey"
                            onClick={() => this.startsWifiScan(false, () => this.disconnect())}
                            variant="outlined"
                            style={styles.buttonIcon}
                            disabled={this.state.processing}
                        >
                            {I18n.t('Disconnect')}
                        </Button>
                    ) : null}
                </div>
            );
        });
    }

    render() {
        if (!this.state.loaded) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader theme={this.state.themeType} />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }
        if (!this.state.interfaces) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <LinearProgress />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        const interIndex = this.state.interfaces.findIndex(i => i.iface === this.state.tabValue);

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <SnackbarProvider />
                    <div
                        className="App"
                        style={{
                            background: this.state.themeType === 'dark' ? '#000' : '#FFF',
                            color: this.state.themeType === 'dark' ? '#EEE' : '#111',
                        }}
                    >
                        <AppBar position="static">
                            <Tabs
                                value={this.state.tabValue}
                                onChange={(e, value) => {
                                    this.setState({ tabValue: value });
                                    window.localStorage.setItem(`network.${this.instance}.tab`, value);
                                }}
                                variant="scrollable"
                            >
                                {this.state.interfaces.map((interfaceItem, i) => (
                                    <Tab
                                        value={interfaceItem.iface}
                                        key={i}
                                        label={
                                            <div style={styles.tabContainer}>
                                                {interfaceItem.type === 'wired' ? (
                                                    <SettingsInputComponentIcon style={styles.buttonIcon} />
                                                ) : (
                                                    <WifiIcon style={styles.buttonIcon} />
                                                )}
                                                {interfaceItem.iface}
                                            </div>
                                        }
                                    />
                                ))}
                            </Tabs>
                            {!this.state.interfaces.length ? I18n.t('No network interfaces detected!') : null}
                        </AppBar>

                        <div style={styles.tabContent}>
                            {interIndex !== -1 && this.renderInterface(this.state.interfaces[interIndex], interIndex)}
                        </div>

                        {this.renderRootDialog()}
                        {this.renderWifiDialog()}
                    </div>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}

export default App;
