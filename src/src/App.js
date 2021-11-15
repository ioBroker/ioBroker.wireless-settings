import React from 'react';
import { MuiThemeProvider, withStyles } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import GenericApp from '@iobroker/adapter-react/GenericApp';
import Loader from '@iobroker/adapter-react/Components/Loader';
import I18n from '@iobroker/adapter-react/i18n';
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
import {
    Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, TextField, FormControlLabel, Grid, Container, IconButton,
    Tooltip, Switch,
} from '@material-ui/core';
import { withSnackbar } from 'notistack';

const styles = () => ({
    root: {},
    tabContent: {
        padding: 10,
        overflow: 'auto',
    },
    tabContentIFrame: {
        padding: 10,
        overflow: 'auto',
    },
    tabContainer: {
        display: 'flex',
    },
});

const ipValidate = (ip, isMask) => {
    let result;
    const matches = ip.match(/^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/);
    if (!matches) {
        result = false;
    } else {
        result = !matches.slice(1).map(el => parseInt(el) >= 0 && parseInt(el) <= 255).includes(false);

        if (isMask && result) {
            result = (parseInt(matches[1]) * 256 ** 3 + parseInt(matches[2]) * 256 ** 2 + parseInt(matches[3]) * 256 + parseInt(matches[4])).toString(2).match(/^1+0+$/);
        }
    }

    return result;
};

const getWiFiIcon = (open, quality) => {
    if (quality > -67) {
        return open ? <SignalWifi4BarIcon /> : <SignalWifi4BarLockIcon />;
    } else if (quality > -70) {
        return open ? <SignalWifi3BarIcon /> : <SignalWifi3BarLockIcon />;
    } else if (quality > -80) {
        return open ? <SignalWifi2BarIcon /> : <SignalWifi2BarLockIcon />;
    } else {
        return open ? <SignalWifi1BarIcon /> : <SignalWifi1BarLockIcon />;
    };
}

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

        this.state = {
            interfaces: [],
            interfacesChanged: [],
            wifi: [],
            dns: [],
            wifiConnections: [],
            sudoDialog: false,
            sudoDialogPassword: '',
            wifiDialog: false,
            wifiDialogPassword: '',
            scanWifi: false,
            scanWifiInterval: null,
        };
    }

    onConnectionReady() {
        this.refresh();
    }

    refreshWiFi = () => {
        return this.socket.sendTo(`network.${this.instance}`, 'wifi', null)
            .then(wifi => {
                if (wifi.length) {
                    wifi = wifi.filter(wifiNetwork => wifiNetwork.ssid.trim() !== '');
                    this.setState({ wifi });
                }
                return this.socket.sendTo(`network.${this.instance}`, 'wifiConnections', null);
            })
            .then(wifiConnections => this.setState({ wifiConnections }));
    }

    refresh() {
        this.socket.sendTo(`network.${this.instance}`, 'interfaces', null)
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

                return this.socket.sendTo(`network.${this.instance}`, 'wifi', null);
            })
            .then(wifi => {
                wifi = wifi.filter(wifiNetwork => wifiNetwork.ssid.trim() !== '');
                this.setState({ wifi });
                return this.socket.sendTo(`network.${this.instance}`, 'dns', null);
            })
            .then(dns => {
                this.setState({ dns });
                return this.socket.sendTo(`network.${this.instance}`, 'wifiConnections', null);
            })
            .then(wifiConnections => this.setState({ wifiConnections }));
    }

    setInterfaceParam = (index, param, value) => {
        const interfaces = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfaces[index][param] = value;
        this.setState({ interfacesChanged: interfaces });
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
        return this.state.selectedTab ? this.state.selectedTab : 0;
    }

    sendData = (index, password) => {
        this.socket.sendTo(`network.${this.instance}`, 'changeInterface', {
            rootPassword: password,
            data: this.state.interfacesChanged[index],
        })
            .then(result => {
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
        this.socket.sendTo(`network.${this.instance}`, 'wifiConnect', { ssid, password, iface: this.state.interfacesChanged[this.getSelectedTab()].iface })
            .then(result => {
                if (result.result) {
                    this.props.enqueueSnackbar(`${ssid} ${I18n.t('connected')}`, { variant: 'success' });
                    this.refresh();
                } else {
                    this.props.enqueueSnackbar(JSON.stringify(result.error), { variant: 'error' });
                }
            });
    }

    disconnect = () => {
        this.socket.sendTo(`network.${this.instance}`, 'wifiDisconnect', { iface: this.state.interfacesChanged[this.getSelectedTab()].iface })
            .then(result => {
                if (result.result) {
                    this.props.enqueueSnackbar(I18n.t('Wi-fi disconnected'), { variant: 'success' });
                    this.refresh();
                } else {
                    this.props.enqueueSnackbar(JSON.stringify(result.error), { variant: 'error' });
                }
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
                    onClick={() => this.setState({
                        sudoDialog: false,
                        sudoDialogPassword: '',
                    })}
                >
                    {I18n.t('Cancel')}
                </Button>
                <Button
                    variant="contained"
                    color="primary"
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

    renderInterface(interfaceItem, i) {
        let buttonDisabled = false;

        if (!interfaceItem.dhcp) {
            buttonDisabled = !ipValidate(interfaceItem.ip4) || !ipValidate(interfaceItem.ip4subnet, true);
        }

        return <>
            <Grid container>
                <Grid item>
                    <div>
                        <FormControlLabel
                            control={<Checkbox
                                checked={interfaceItem.dhcp}
                                onChange={e => this.setInterfaceParam(i, 'dhcp', e.target.checked)}
                            />}
                            label={I18n.t('DHCP')}
                        />
                    </div>
                    <>
                        <h4>IPv4</h4>
                        <div>
                            <TextField
                                value={interfaceItem.ip4}
                                label={I18n.t('IPv4')}
                                onChange={e => this.setInterfaceParam(i, 'ip4', e.target.value)}
                                disabled={interfaceItem.dhcp}
                            />
                        </div>
                        <div>
                            <TextField
                                value={interfaceItem.ip4subnet}
                                label={I18n.t('IPv4 netmask')}
                                onChange={e => this.setInterfaceParam(i, 'ip4subnet', e.target.value)}
                                disabled={interfaceItem.dhcp}
                            />
                        </div>
                        <div>
                            <TextField
                                value={interfaceItem.gateway}
                                label={I18n.t('Gateway')}
                                onChange={e => this.setInterfaceParam(i, 'gateway', e.target.value)}
                                disabled={interfaceItem.dhcp}
                            />
                        </div>
                        <h4>IPv6</h4>
                        <div>
                            <TextField
                                value={interfaceItem.ip6}
                                label={I18n.t('IPv6')}
                                disabled
                            />
                        </div>
                        <div>
                            <TextField
                                value={interfaceItem.ip6subnet}
                                label={I18n.t('IPv6 netmask')}
                                disabled
                            />
                        </div>
                        <h4>DNS</h4>
                    </>
                    {
                        interfaceItem.dns && interfaceItem.dns.map((dnsRecord, dnsI) => <div key={dnsI}>
                            <TextField
                                value={dnsRecord}
                                label={I18n.t('DNS record')}
                                onChange={e => this.setDns(i, dnsI, e.target.value)}
                                disabled={interfaceItem.dhcp}
                            />
                            {!interfaceItem.dhcp && interfaceItem.dns && interfaceItem.dns.length > 1 ? <IconButton onClick={() => this.removeDns(i, dnsI)}>
                                <DeleteIcon />
                            </IconButton> : null}
                        </div>)
                    }
                    <div>
                        {
                            !interfaceItem.dhcp ? 
                            <IconButton onClick={() => this.addDns(i)}>
                                <AddIcon />
                            </IconButton>
                            : null
                        }
                    </div>
                    <div>
                        <Button
                            variant="contained"
                            color="primary"
                            disabled={buttonDisabled}
                            onClick={() => this.sendData(i, '')}
                        >
                            {I18n.t('Save')}
                        </Button>
                    </div>
                </Grid>
                {interfaceItem.type === 'wired'
                    ? null
                    : <Grid item>
                        <div>
                            <FormControlLabel control={<Switch checked={this.state.scanWifi} onChange={() => {
                                if (!this.state.scanWifi) {
                                    this.setState({
                                        scanWifiInterval: setInterval(this.refreshWiFi, 4000)
                                    });
                                } else {
                                    clearInterval(this.state.scanWifiInterval);
                                    this.setState({
                                        scanWifiInterval: null
                                    });
                                }
                                this.setState({scanWifi: !this.state.scanWifi});
                            }}/>} label={I18n.t('Wifi scan')} />
                        </div>
                        {this.renderWifi()}
                    </Grid>}
            </Grid>
            <pre>
                {/* {interfaceItem.type === 'wireless'
                    ? JSON.stringify(this.state.wifi, null, 2) + JSON.stringify(this.state.wifiConnections, null, 2)
                    : null} */}
                {/* {JSON.stringify(interfaceItem, null, 2)} */}
            </pre>
        </>;
    }

    renderWifi() {
        return this.state.wifi.map((wifi, i) => {
            const connected = !!(this.state.wifiConnections.length && wifi.ssid === this.state.wifiConnections[0].ssid);
            return <div key={i}>
                <Button
                    variant={connected ? 'contained' : undefined}
                    color={connected ? 'primary' : undefined}
                    disabled={connected}
                    onClick={() => {
                        if (wifi.security.includes('Open')) {
                            this.connect(wifi.ssid, '');
                        } else {
                            this.setState({ wifiDialog: wifi.ssid });
                        }
                    }}
                >
                    <Tooltip title={wifi.quality + ' dBm'}>
                        {getWiFiIcon(wifi.security.includes('Open'), parseInt(wifi.quality))}
                    </Tooltip>
                    &nbsp;
                    {wifi.ssid}
                    {' '}
                </Button>
                {' '}
                {connected
                    ? <>
                        <Button onClick={this.disconnect}>{I18n.t('Disconnect')}</Button>
                    </>
                    : ''}
            </div>;
        });
    }

    render() {
        if (!this.state.loaded || !this.state.interfaces.length) {
            return <MuiThemeProvider theme={this.state.theme}>
                <Loader theme={this.state.themeType} />
            </MuiThemeProvider>;
        }

        return <MuiThemeProvider theme={this.state.theme}>
            <div className="App" style={{ background: this.state.themeType === 'dark' ? '#000' : '#FFF' }}>
                <Container>
                    <AppBar position="static">
                        <Tabs value={this.getSelectedTab()} onChange={(e, index) => this.selectTab(index, index)} variant="scrollable">
                            {this.state.interfaces.map((interfaceItem, i) => <Tab
                                key={i}
                                label={<div className={this.props.classes.tabContainer}>
                                    {interfaceItem.type === 'wired' ? <SettingsInputComponentIcon /> : <WifiIcon />}
                                    &nbsp;
                                    {interfaceItem.iface}
                                </div>}
                            />)}
                        </Tabs>
                    </AppBar>

                    <div className={this.isIFrame ? this.props.classes.tabContentIFrame : this.props.classes.tabContent}>

                        {this.renderInterface(this.state.interfacesChanged[this.getSelectedTab()], this.getSelectedTab())}

                    </div>
                    {this.renderRootDialog()}
                    {this.renderWifiDialog()}
                </Container>
            </div>
        </MuiThemeProvider>;
    }
}

export default withSnackbar(withStyles(styles)(App));
