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
import SignalWifi4BarIcon from '@material-ui/icons/SignalWifi4Bar';
import SignalWifi4BarLockIcon from '@material-ui/icons/SignalWifi4BarLock';
import {
    Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, TextField, FormControlLabel,
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
    let result = true;
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
        };
    }

    onConnectionReady() {
        this.refresh();
    }

    refresh() {
        this.socket.sendTo('network.0', 'interfaces', null).then(result => {
            result.sort((item1, item2) => (item1.mac > item2.mac ? -1 : 1));
            result.sort(item1 => (item1.type === 'wired' ? -1 : 1));
            result.sort(item1 => (!item1.virtual ? -1 : 1));
            result = result.filter(interfaceItem => interfaceItem.ip4 !== '127.0.0.1');
            result = result.map(interfaceItem => {
                if (typeof interfaceItem.dhcp === 'string') {
                    interfaceItem.dhcp = JSON.parse(interfaceItem.dhcp);
                }

                return interfaceItem;
            });
            this.setState({ interfaces: result, interfacesChanged: result });
        });
        this.socket.sendTo('network.0', 'wifi', null).then(result => {
            this.setState({ wifi: result });
        });
        this.socket.sendTo('network.0', 'dns', null).then(result => {
            this.setState({ dns: result });
        });
        this.socket.sendTo('network.0', 'wifiConnections', null).then(result => {
            this.setState({ wifiConnections: result });
        });
    }

    setInterfaceParam = (index, param, value) => {
        const interfaces = JSON.parse(JSON.stringify(this.state.interfacesChanged));
        interfaces[index][param] = value;
        this.setState({ interfacesChanged: interfaces });
    }

    getSelectedTab() {
        return this.state.selectedTab ? this.state.selectedTab : 0;
    }

    sendData = (index, password) => {
        this.socket.sendTo('network.0', 'changeInterface', {
            rootPassword: password,
            data: this.state.interfacesChanged[index],
        }).then(result => {
            if (result) {
                this.props.enqueueSnackbar(I18n.t('Interface updated'), { variant: 'success' });
            } else {
                this.props.enqueueSnackbar(I18n.t('Interface not updated'), { variant: 'error' });
            }
        });
    }

    connect = (ssid, password) => {
        this.socket.sendTo('network.0', 'wifiConnect', {
            ssid, password,
        }).then(result => {
            if (result.result) {
                this.props.enqueueSnackbar(`${ssid} ${I18n.t('connected')}`, { variant: 'success' });
                this.refresh();
            } else {
                this.props.enqueueSnackbar(JSON.stringify(result.error), { variant: 'error' });
            }
        });
    }

    disconnect = () => {
        this.socket.sendTo('network.0', 'wifiDisconnect', null).then(result => {
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
                <Button onClick={() => {
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
                <Button onClick={() => {
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
                <div>
                    <TextField value={interfaceItem.ip4} label={I18n.t('IPv4')} onChange={e => this.setInterfaceParam(i, 'ip4', e.target.value)} disabled={interfaceItem.dhcp} />
                </div>
                <div>
                    <TextField value={interfaceItem.ip4subnet} label={I18n.t('IPv4 netmask')} onChange={e => this.setInterfaceParam(i, 'ip4subnet', e.target.value)} disabled={interfaceItem.dhcp} />
                </div>
                <div>
                    <TextField value={interfaceItem.ip6} label={I18n.t('IPv6')} onChange={e => this.setInterfaceParam(i, 'ip6', e.target.value)} disabled={interfaceItem.dhcp} />
                </div>
                <div>
                    <TextField value={interfaceItem.ip6subnet} label={I18n.t('IPv6 netmask')} onChange={e => this.setInterfaceParam(i, 'ip6subnet', e.target.value)} disabled={interfaceItem.dhcp} />
                </div>
            </>
            <div>
                <Button
                    disabled={buttonDisabled}
                    onClick={() => this.setState({
                        sudoDialog: i,
                    })}
                >
                    {I18n.t('Save')}
                </Button>
            </div>
            {interfaceItem.type === 'wireless'
                ? this.renderWifi()
                : null}
            <pre>
                {JSON.stringify(interfaceItem, null, 2)}
                {interfaceItem.type === 'wireless'
                    ? JSON.stringify(this.state.wifi, null, 2) + JSON.stringify(this.state.wifiConnections, null, 2)
                    : null}
            </pre>
        </>;
    }

    renderDns() {
        return <>
            {
                this.state.dns.map((dnsRecord, i) => <div>
                    <TextField
                        key={i}
                        value={dnsRecord}
                        label={I18n.t('DNS record')}
                        onChange={e => this.setInterfaceParam(i, 'ip4', e.target.value)}
                    />
                </div>)
            }
            <div>
                <Button
                    onClick={() => this.setState({
                        sudoDialog: '',
                    })}
                >
                    {I18n.t('Save')}
                </Button>
            </div>
        </>;
    }

    renderWifi() {
        return this.state.wifi.map((wifi, i) => <div key={i}>
            <Button onClick={() => {
                if (wifi.security.includes('Open')) {
                    this.connect(wifi.ssid, '');
                } else {
                    this.setState({
                        wifiDialog: wifi.ssid,
                    });
                }
            }}
            >
                {wifi.security.includes('Open')
                    ? <SignalWifi4BarIcon />
                    : <SignalWifi4BarLockIcon />}
                {wifi.ssid}
            </Button>
            {' '}
            {this.state.wifiConnections.length && wifi.ssid === this.state.wifiConnections[0].ssid
                ? <>
                    connected
                    <Button onClick={this.disconnect}>{I18n.t('Disconnect')}</Button>
                </>
                : ''}
        </div>);
    }

    render() {
        if (!this.state.loaded || !this.state.interfaces.length) {
            return <MuiThemeProvider theme={this.state.theme}>
                <Loader theme={this.state.themeType} />
            </MuiThemeProvider>;
        }

        return <MuiThemeProvider theme={this.state.theme}>
            <div className="App" style={{ background: this.state.themeType === 'dark' ? '#000' : '#FFF' }}>
                <AppBar position="static">

                    <Tabs value={this.getSelectedTab()} onChange={(e, index) => this.selectTab(index, index)} variant="scrollable">
                        {this.state.interfaces.map((interfaceItem, i) => <Tab
                            key={i}
                            label={<div className={this.props.classes.tabContainer}>
                                {interfaceItem.type === 'wired' ? <SettingsInputComponentIcon /> : <WifiIcon />}
                                {interfaceItem.iface}
                            </div>}
                        />)}
                    </Tabs>
                </AppBar>

                <div className={this.isIFrame ? this.props.classes.tabContentIFrame : this.props.classes.tabContent}>
                    {this.renderInterface(this.state.interfacesChanged[this.getSelectedTab()], this.getSelectedTab())}
                    {this.renderDns()}
                </div>
                {this.renderRootDialog()}
                {this.renderWifiDialog()}
            </div>
        </MuiThemeProvider>;
    }
}

export default withSnackbar(withStyles(styles)(App));
