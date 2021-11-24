import React from 'react';
import { MuiThemeProvider, withStyles } from '@material-ui/core/styles';
import { withSnackbar } from 'notistack';

import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    FormControlLabel,
    Grid,
    IconButton,
    Tooltip,
    Switch,
    LinearProgress,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from '@material-ui/core';

import SettingsInputComponentIcon from '@material-ui/icons/SettingsInputComponent';
import WifiIcon from '@material-ui/icons/Wifi';
import SignalWifi1BarIcon from '@material-ui/icons/SignalWifi1Bar';
import SignalWifi1BarLockIcon from '@material-ui/icons/SignalWifi1BarLock';
import SignalWifi2BarIcon from '@material-ui/icons/SignalWifi2Bar';
import SignalWifi2BarLockIcon from '@material-ui/icons/SignalWifi2BarLock';
import SignalWifi3BarIcon from '@material-ui/icons/SignalWifi3Bar';
import SignalWifi3BarLockIcon from '@material-ui/icons/SignalWifi3BarLock';
import SignalWifi4BarIcon from '@material-ui/icons/SignalWifi4Bar';
import SignalWifi4BarLockIcon from '@material-ui/icons/SignalWifi4BarLock';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import IconCancel from '@material-ui/icons/Cancel';

import GenericApp from '@iobroker/adapter-react/GenericApp';
import Loader from '@iobroker/adapter-react/Components/Loader';
import I18n from '@iobroker/adapter-react/i18n';

import countries from './countries.json';

const styles = () => ({
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
});

const ipValidate = (ip, isMask) => {
    let result;
    const matches = (ip || '').match(/^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/);
    if (!matches) {
        result = false;
    } else {
        result = !matches.slice(1).find(el => parseInt(el) < 0 || parseInt(el) > 255);

        if (isMask && result) {
            result = (0x100000000 + (parseInt(matches[1], 10) << 24) + (parseInt(matches[2], 10) << 16) + (parseInt(matches[3], 10) << 8) + parseInt(matches[4], 10)).toString(2).match(/^1+0+$/);
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
    } if (quality > -70) {
        return open ? <SignalWifi3BarIcon style={style} /> : <SignalWifi3BarLockIcon style={style} />;
    } if (quality > -80) {
        return open ? <SignalWifi2BarIcon style={style} /> : <SignalWifi2BarLockIcon style={style} />;
    }
    return open ? <SignalWifi1BarIcon style={style} /> : <SignalWifi1BarLockIcon style={style} />;
};

class App extends GenericApp {
    constructor(props) {
        const extendedProps = {};
        extendedProps.translations = {
            en: require('./i18n/en'),
            de: require('./i18n/de'),
            ru: require('./i18n/ru'),
            pt: require('./i18n/pt'),
            nl: require('./i18n/nl'),
            fr: require('./i18n/fr'),
            it: require('./i18n/it'),
            es: require('./i18n/es'),
            pl: require('./i18n/pl'),
            'zh-cn': require('./i18n/zh-cn'),
        };
        extendedProps.doNotLoadAllObjects = true;
        extendedProps.adapterName = 'network';

        super(props, extendedProps);

        this.pendingWifiInterval = null;
        this.scanWifiInterval = null;
    }

    componentWillUnmount() {
        this.pendingWifiInterval && clearInterval(this.pendingWifiInterval);
        this.pendingWifiInterval = null;

        this.scanWifiInterval && clearInterval(this.scanWifiInterval);
        this.scanWifiInterval = null;
    }

    onConnectionReady() {
        this.setState({
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
        }, () => this.refresh());
    }

    refreshWiFi = () => {
        let wifiConnectionsLocal = null;
        return this.socket.sendTo(`network.${this.instance}`, 'wifiConnections', null)
            .then(wifiConnections => {
                wifiConnectionsLocal = wifiConnections;
                this.setState({ wifiConnections });
                return this.socket.sendTo(`network.${this.instance}`, 'wifi', null);
            })
            .then(wifi => {
                if (wifi.length) {
                    wifi = wifi.filter(wifiNetwork => wifiNetwork.ssid.trim() !== '').sort((a, b) => {
                        const connectedA = !!(wifiConnectionsLocal.length && a.ssid === wifiConnectionsLocal[0].ssid);
                        const connectedB = !!(wifiConnectionsLocal.length && b.ssid === wifiConnectionsLocal[0].ssid);
                        if (connectedA) {
                            return -1;
                        } if (connectedB) {
                            return 1;
                        }
                        return b.quality - a.quality;
                    });
                    this.setState({ wifi });
                }
            });
    }

    refresh() {
        if (this.state.firstRequest === 0) {
            this.setState({ firstRequest: 1 });
        }
        return this.socket.sendTo(`network.${this.instance}`, 'interfaces', null)
            .then(interfaces => {
                interfaces.sort((item1, item2) => (item1.mac > item2.mac ? -1 : 1));
                interfaces.sort((item1, item2) => (item1.type === 'wired' ? -1 : 1));
                interfaces.sort((item1, item2) => (!item1.virtual ? -1 : 1));
                interfaces = interfaces.filter(interfaceItem => interfaceItem.ip4 !== '127.0.0.1');
                interfaces = interfaces.map(interfaceItem => {
                    if (typeof interfaceItem.dhcp === 'string') {
                        interfaceItem.dhcp = JSON.parse(interfaceItem.dhcp);
                    }

                    return interfaceItem;
                });

                this.setState({ interfaces, interfacesChanged: JSON.parse(JSON.stringify(interfaces)) });

                return this.refreshWiFi();
            })
            .then(() => this.socket.sendTo(`network.${this.instance}`, 'dns', null))
            .then(dns => this.setState({ dns, firstRequest: 2 }));
    }

    setInterfaceParam = (index, param, value) => {
        const interfacesChanged = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfacesChanged[index][param] = value;
        this.setState({ interfacesChanged });
    }

    setDns = (interfaceIndex, dnsIndex, value) => {
        const interfacesChanged = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfacesChanged[interfaceIndex].dns[dnsIndex] = value;
        this.setState({ interfacesChanged });
    }

    addDns = interfaceIndex => {
        const interfacesChanged = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfacesChanged[interfaceIndex].dns.push('');
        this.setState({ interfacesChanged });
    }

    removeDns = (interfaceIndex, dnsIndex) => {
        const interfacesChanged = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfacesChanged[interfaceIndex].dns.splice(dnsIndex, 1);
        this.setState({ interfacesChanged });
    }

    getSelectedTab() {
        return this.state.selectedTab ? this.state.selectedTab : '0';
    }

    sendData = (index, password) => {
        this.setState({ processing: true });
        this.socket.sendTo(`network.${this.instance}`, 'changeInterface', {
            rootPassword: password,
            data: this.state.interfacesChanged[index],
        })
            .then(result => {
                this.setState({ processing: false });
                if (result) {
                    this.props.enqueueSnackbar(I18n.t('Interface updated'), { variant: 'success' });
                    this.refresh();
                } else {
                    this.props.enqueueSnackbar(I18n.t('Interface not updated'), { variant: 'error' });
                }
            });

        if (window.location.hostname === this.state.interfaces[index].ip4 && this.state.interfacesChanged[index].ip4 !== this.state.interfaces[index].ip4) {
            window.location.href = `http://${this.state.interfacesChanged[index].ip4}:${window.location.port}`;
        }
    }

    connect = (ssid, password) => {
        this.setState({ processing: true });
        return this.socket.sendTo(`network.${this.instance}`, 'wifiConnect', { ssid, password, iface: this.state.interfacesChanged[this.getSelectedTab()].iface })
            .then(() => {
                this.refreshWiFi();
                const startTime = Date.now();

                this.pendingWifiInterval = setInterval(() => {
                    if (this.state.wifiConnections.length && ssid === this.state.wifiConnections[0].ssid) {
                        this.props.enqueueSnackbar(`${ssid} ${I18n.t('connected')}`, { variant: 'success' });
                        clearInterval(this.pendingWifiInterval);
                        this.pendingWifiInterval = null;
                        this.refresh()
                            .then(() => this.setState({ processing: false }));
                    } else if (Date.now() - startTime > 40 * 1000) {
                        this.props.enqueueSnackbar(`${ssid} ${I18n.t('not connected')}`, { variant: 'error' });
                        clearInterval(this.pendingWifiInterval);
                        this.pendingWifiInterval = null;
                        this.refresh()
                            .then(() => this.setState({ processing: false }));
                    } else {
                        this.refreshWiFi();
                    }
                }, 1000);
            });
    }

    disconnect = () => {
        this.setState({ processing: true });
        return this.socket.sendTo(`network.${this.instance}`, 'wifiDisconnect', { iface: this.state.interfacesChanged[this.getSelectedTab()].iface })
            .then(() => {
                this.refreshWiFi();
                const startTime = Date.now();
                this.pendingWifiInterval = setInterval(() => {
                    if (this.state.wifiConnections.length === 0) {
                        this.props.enqueueSnackbar(I18n.t('Wi-fi disconnected'), { variant: 'success' });
                        clearInterval(this.pendingWifiInterval);
                        this.pendingWifiInterval = null;
                        this.refresh()
                            .then(() => this.setState({ processing: false }));
                    } else if (Date.now() - startTime > 40 * 1000) {
                        this.props.enqueueSnackbar(I18n.t('Wi-fi disconnected'), { variant: 'error' });
                        clearInterval(this.pendingWifiInterval);
                        this.pendingWifiInterval = null;
                        this.refresh()
                            .then(() => this.setState({ processing: false }));
                    } else {
                        this.refreshWiFi();
                    }
                }, 1000);
            });
    }

    renderRootDialog() {
        return <Dialog
            open={this.state.sudoDialog !== false}
            onClose={() => this.setState({
                sudoDialog: false,
                sudoDialogPassword: '',
            })}
        >
            <DialogTitle>{I18n.t('Enter sudo password')}</DialogTitle>
            <DialogContent>
                <TextField
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
                    onClick={() => this.setState({
                        sudoDialog: false,
                        sudoDialogPassword: '',
                    })}
                    startIcon={<IconCancel />}
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderWifiDialog() {
        return <Dialog
            open={this.state.wifiDialog !== false}
            onClose={() => this.setState({
                wifiDialog: false,
                wifiDialogPassword: '',
            })}
        >
            <DialogTitle>{I18n.t('Enter wifi password')}</DialogTitle>
            <DialogContent>
                <TextField
                    value={this.state.wifiDialogPassword}
                    onChange={e => this.setState({ wifiDialogPassword: e.target.value })}
                    type="password"
                />
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    onClick={() => this.setState({
                        wifiDialog: false,
                        wifiDialogPassword: '',
                    })}
                >
                    {I18n.t('Cancel')}
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    disabled={!this.state.wifiDialogPassword}
                    onClick={() => {
                        this.connect(this.state.wifiDialog, this.state.wifiDialogPassword);
                        this.setState({
                            wifiDialog: false,
                            wifiDialogPassword: '',
                        });
                    }}
                >
                    {I18n.t('Send')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    startsWifiScan(enabled, cb) {
        if (enabled === true) {
            this.scanWifiInterval = this.scanWifiInterval || setInterval(this.refreshWiFi, 4000);
            this.setState({ scanWifi: true }, () => cb && cb());
        } else if (enabled === false) {
            this.scanWifiInterval && clearInterval(this.scanWifiInterval);
            this.scanWifiInterval = null;
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

        if (!interfaceItem.dhcp) {
            ipValid = ipValidate(interfaceItem.ip4);
            maskValid = ipValidate(interfaceItem.ip4subnet, true);
            gatewayValid = ipValidate(interfaceItem.gateway);

            saveEnabled = ipValid && maskValid && gatewayValid;
            if (saveEnabled) {
                if (interfaceItem.dhcp !== this.state.interfaces[i].dhcp) {
                    saveEnabled = true;
                } else {
                    saveEnabled = interfaceItem.ip4 !== this.state.interfaces[i].ip4
                        || interfaceItem.ip4subnet !== this.state.interfaces[i].ip4subnet
                        || interfaceItem.gateway !== this.state.interfaces[i].gateway
                        || interfaceItem.country !== this.state.interfaces[i].country;
                }
            }
        } else {
            saveEnabled = interfaceItem.dhcp !== this.state.interfaces[i].dhcp;
        }

        return <>
            <Grid container>
                <Grid item className={this.props.classes.gridItem}>
                    <FormControlLabel
                        control={<Checkbox
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
                        />}
                        label={I18n.t('DHCP')}
                    />
                    <>
                        {interfaceItem.type === 'wireless'
                            ? <>
                                <h4>WiFi</h4>
                                <FormControl>
                                    <InputLabel>{I18n.t('Country')}</InputLabel>
                                    <Select
                                        fullWidth
                                        value={interfaceItem.country ? interfaceItem.country : 'DE'}
                                        onChange={e => this.setInterfaceParam(i, 'country', e.target.value)}
                                    >
                                        {
                                            Object.keys(countries)
                                                .sort((code1, code2) => (countries[code1] > countries[code2] ? 1 : -1))
                                                .map(code => <MenuItem value={code}>{countries[code]}</MenuItem>)
                                        }
                                    </Select>
                                </FormControl>
                            </> : null}
                        <h4>IPv4</h4>
                        <TextField
                            className={this.props.classes.input}
                            value={interfaceItem.ip4}
                            error={!ipValid}
                            label={I18n.t('IPv4')}
                            onChange={e => this.setInterfaceParam(i, 'ip4', e.target.value)}
                            disabled={interfaceItem.dhcp || !interfaceItem.editable}
                            helperText={!ipValid ? I18n.t('Invalid IP address') : ''}
                        />
                        <TextField
                            className={this.props.classes.input}
                            value={interfaceItem.ip4subnet}
                            error={!maskValid}
                            label={I18n.t('IPv4 netmask')}
                            onChange={e => this.setInterfaceParam(i, 'ip4subnet', e.target.value)}
                            disabled={interfaceItem.dhcp || !interfaceItem.editable}
                            helperText={!maskValid ? I18n.t('Invalid netmask') : ''}
                        />
                        <TextField
                            className={this.props.classes.input}
                            value={interfaceItem.gateway}
                            error={!gatewayValid}
                            label={I18n.t('Default gateway')}
                            onChange={e => this.setInterfaceParam(i, 'gateway', e.target.value)}
                            disabled={interfaceItem.dhcp || !interfaceItem.editable}
                            helperText={!gatewayValid ? I18n.t('Invalid default gateway') : ''}
                        />
                        <h4>IPv6</h4>
                        <TextField
                            className={this.props.classes.input}
                            value={interfaceItem.ip6}
                            label={I18n.t('IPv6')}
                            disabled
                        />
                        <TextField
                            value={interfaceItem.ip6subnet}
                            label={I18n.t('IPv6 netmask')}
                            disabled
                        />
                        <h4>DNS</h4>
                    </>
                    {
                        interfaceItem.dns && interfaceItem.dns.map((dnsRecord, dnsI) => <div key={dnsI}>
                            <TextField
                                value={dnsRecord}
                                label={I18n.t('DNS record')}
                                onChange={e => this.setDns(i, dnsI, e.target.value)}
                                disabled={interfaceItem.dhcp || !interfaceItem.editable}
                            />
                            {interfaceItem.editable && !interfaceItem.dhcp && interfaceItem.dns && interfaceItem.dns.length > 1 ? <IconButton onClick={() => this.removeDns(i, dnsI)}>
                                <DeleteIcon />
                            </IconButton> : null}
                        </div>)
                    }
                    {
                        interfaceItem.editable && !interfaceItem.dhcp
                            ? <IconButton onClick={() => this.addDns(i)} title={I18n.t('Add DNS record')}>
                                <AddIcon />
                            </IconButton>
                            : null
                    }
                    { interfaceItem.editable && !interfaceItem.dhcp ? <br /> : null }
                    {interfaceItem.editable
                        ? <Button
                            variant="contained"
                            color="primary"
                            disabled={!saveEnabled || this.state.processing}
                            onClick={() => this.sendData(i, '')}
                        >
                            {I18n.t('Save')}
                        </Button> : null}
                </Grid>
                {interfaceItem.type === 'wired'
                    ? null
                    : <Grid item className={this.props.classes.gridItem}>
                        {this.state.processing || this.state.firstRequest < 2 ? <LinearProgress /> : null}
                        <FormControlLabel
                            control={<Switch
                                disabled={this.state.processing}
                                checked={this.state.scanWifi}
                                onChange={() => this.startsWifiScan()}
                            />}
                            label={I18n.t('Wifi scan')}
                        />
                        {this.renderWifi()}
                    </Grid>}
            </Grid>
            {/* <pre>
                 {interfaceItem.type === 'wireless'
                    ? JSON.stringify(this.state.wifi, null, 2) + JSON.stringify(this.state.wifiConnections, null, 2)
                    : null}
                 {JSON.stringify(interfaceItem, null, 2)}
            </pre> */}
        </>;
    }

    renderWifi() {
        return this.state.wifi.map((wifi, i) => {
            const connected = !!(this.state.wifiConnections.length && wifi.ssid === this.state.wifiConnections[0].ssid);
            return <div key={i}>
                <Button
                    variant={connected ? 'contained' : undefined}
                    color={connected ? 'primary' : undefined}
                    disabled={connected || this.state.processing}
                    title={connected ? '' : I18n.t('Click to connect')}
                    onClick={() => this.startsWifiScan(false, () => {
                        if (wifi.security.includes('Open')) {
                            this.connect(wifi.ssid, '');
                        } else {
                            this.setState({ wifiDialog: wifi.ssid });
                        }
                    })}
                >
                    <Tooltip title={`${wifi.quality} dBm`}>
                        {getWiFiIcon(wifi.security.includes('Open'), parseInt(wifi.quality))}
                    </Tooltip>
                    {wifi.ssid}
                </Button>
                {connected
                    ? <Button
                        onClick={() => {
                            this.startsWifiScan(false, () => this.disconnect());
                        }}
                        variant="outlined"
                        className={this.props.classes.buttonIcon}
                        disabled={this.state.processing}
                    >
                        {I18n.t('Disconnect')}
                    </Button>
                    : null}
            </div>;
        });
    }

    render() {
        if (!this.state.loaded) {
            return <MuiThemeProvider theme={this.state.theme}>
                <Loader theme={this.state.themeType} />
            </MuiThemeProvider>;
        }
        if (!this.state.interfaces) {
            return <MuiThemeProvider theme={this.state.theme}>
                <LinearProgress />
            </MuiThemeProvider>;
        }

        return <MuiThemeProvider theme={this.state.theme}>
            <div className="App" style={{ background: this.state.themeType === 'dark' ? '#000' : '#FFF', color: this.state.themeType === 'dark' ? '#EEE' : '#111' }}>
                <AppBar position="static">
                    <Tabs
                        value={this.getSelectedTab()}
                        onChange={(e, index) => this.selectTab(index, index)}
                        variant="scrollable"
                    >
                        {this.state.interfaces.map((interfaceItem, i) => <Tab
                            value={i.toString()}
                            key={i}
                            label={<div className={this.props.classes.tabContainer}>
                                {interfaceItem.type === 'wired' ? <SettingsInputComponentIcon className={this.props.classes.buttonIcon} /> : <WifiIcon className={this.props.classes.buttonIcon} />}
                                {interfaceItem.iface}
                            </div>}
                        />)}
                    </Tabs>
                    {!this.state.interfaces.length ? I18n.t('No network interfaces detected!') : null}
                </AppBar>

                <div className={this.props.classes.tabContent}>
                    {this.renderInterface(this.state.interfacesChanged[this.getSelectedTab()], this.getSelectedTab())}
                </div>

                {this.renderRootDialog()}
                {this.renderWifiDialog()}
            </div>
        </MuiThemeProvider>;
    }
}

export default withSnackbar(withStyles(styles)(App));
