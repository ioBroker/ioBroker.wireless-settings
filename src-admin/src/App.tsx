import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { enqueueSnackbar, SnackbarProvider } from 'notistack';

import {
    Alert,
    AppBar,
    Tabs,
    Tab,
    Chip,
    Button,
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
    CircularProgress,
    InputAdornment,
} from '@mui/material';
import {
    SettingsInputComponent as SettingsInputComponentIcon,
    Wifi as WifiIcon,
    Refresh as RefreshIcon,
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
} from '@mui/icons-material';

import {
    Loader,
    I18n,
    GenericApp,
    type GenericAppProps,
    type GenericAppState,
    type GenericAppSettings,
} from '@iobroker/gui-components';

interface AppProps extends GenericAppProps {
    common?: Record<string, any>;
}

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

type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'unavailable' | 'unmanaged' | 'unknown';

type InterfaceType = 'ethernet' | 'loopback' | 'wifi' | 'wifi-p2p' | 'bridge' | 'bond';

type WifiSecurity = '--' | 'WPA' | 'WPA2';

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
    configIp4: string;
    configIp4subnet: string;
    configGateway: string;
    configDns: string[];
    connection: string;
    type: InterfaceType;
    editable: boolean;
    virtual?: boolean;
    status: ConnectionState;
    slaveOf?: string;
}

interface WirelessNetwork {
    security: WifiSecurity;
    ssid: string;
    quality: number;
    channel: number;
    speed: string;
}

interface SetInterfaceConfigResult {
    success: boolean;
    message: string;
    connection?: string;
    scheduled?: boolean;
}

interface NormalizedConfig {
    dhcp: boolean;
    configIp4: string;
    configIp4subnet: string;
    configGateway: string;
    configDns: string[];
}

interface AppState extends GenericAppState {
    tabValue: string;
    interfaces: NetworkInterface[] | null;
    interfacesChanged: NetworkInterface[];
    wifi: WirelessNetwork[];
    wifiConnection: string;
    wifiDialog: string | false;
    wifiDialogPassword: string;
    wifiPasswordVisible?: boolean;
    scanWifi: boolean;
    processing: boolean;
    firstRequest: 0 | 1 | 2;
    scanning: boolean;
    timeout: boolean;
    alive: boolean;
}

const styles: Record<string, React.CSSProperties> = {
    tabContent: {
        padding: 10,
        overflow: 'auto',
        height: 'calc(100% - 64px)',
    },
    tabLabel: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
    },
    buttonIcon: {
        marginLeft: 10,
    },
    connected: {
        color: 'green',
    },
    input: {
        display: 'block',
        marginBottom: 10,
    },
    speed: {
        opacity: 0.5,
        fontSize: 10,
        fontStyle: 'italic',
        position: 'absolute',
        bottom: -5,
        left: 50,
    },
};

const getWiFiIcon = (open: boolean, quality: number): React.ReactElement => {
    const style: React.CSSProperties = { marginRight: 8 };

    if (quality > 80) {
        return open ? <SignalWifi4BarIcon style={style} /> : <SignalWifi4BarLockIcon style={style} />;
    }
    if (quality > 60) {
        return open ? <SignalWifi3BarIcon style={style} /> : <SignalWifi3BarLockIcon style={style} />;
    }
    if (quality > 30) {
        return open ? <SignalWifi2BarIcon style={style} /> : <SignalWifi2BarLockIcon style={style} />;
    }
    return open ? <SignalWifi1BarIcon style={style} /> : <SignalWifi1BarLockIcon style={style} />;
};

export default class App extends GenericApp<AppProps, AppState> {
    private scanWifiTimer: ReturnType<typeof setTimeout> | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: AppProps) {
        const extendedProps: GenericAppSettings = {};
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
        extendedProps.adapterName = 'wireless-settings';
        if (window.location.port === '3000') {
            extendedProps.socket = {
                host: '192.168.1.129',
                port: 8081,
            };
        }

        super(props, extendedProps);

        Object.assign(this.state, {
            tabValue: window.localStorage.getItem(`network.${this.instance}.tab`) || '',
            interfaces: null,
            interfacesChanged: [],
            wifi: [],
            wifiConnection: '',
            wifiDialog: false,
            wifiDialogPassword: '',
            scanWifi: false,
            processing: false,
            firstRequest: 0,
            scanning: false,
            timeout: false,
            alive: false,
        });
    }

    static normalizeDnsList(dns: string[] | string | null | undefined): string[] {
        if (!dns) {
            return [];
        }
        if (Array.isArray(dns)) {
            return dns.map(item => `${item}`.trim()).filter(Boolean);
        }
        return dns
            .split(/[\n,;]+/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    static normalizeInterfaceConfig(interfaceItem: NetworkInterface | null | undefined): NormalizedConfig {
        return {
            dhcp: !!interfaceItem?.dhcp,
            configIp4: (interfaceItem?.configIp4 || '').trim(),
            configIp4subnet: (interfaceItem?.configIp4subnet || '').trim(),
            configGateway: (interfaceItem?.configGateway || '').trim(),
            configDns: App.normalizeDnsList(interfaceItem?.configDns),
        };
    }

    componentWillUnmount(): void {
        if (this.scanWifiTimer) {
            clearTimeout(this.scanWifiTimer);
            this.scanWifiTimer = null;
        }
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.socket.unsubscribeState(`system.adapter.wireless-settings.${this.instance}.alive`, this.onAliveChanged);
    }

    async onConnectionReady(): Promise<void> {
        const alive = await this.socket.getState(`system.adapter.wireless-settings.${this.instance}.alive`);
        this.setState({ alive: !!alive?.val }, async () => {
            await this.socket.subscribeState(
                `system.adapter.wireless-settings.${this.instance}.alive`,
                this.onAliveChanged,
            );
            await this.refresh();
        });
    }

    onAliveChanged = async (_id: string, state: ioBroker.State | null | undefined): Promise<void> => {
        if (this.state.alive !== !!state?.val) {
            this.setState({ alive: !!state?.val });
            if (state?.val) {
                await this.refresh();
            }
        }
    };

    getEditedInterface(): NetworkInterface | undefined {
        return this.state.interfacesChanged.find(i => i.iface === this.state.tabValue);
    }

    updateEditedInterface = (update: Partial<NetworkInterface>): void => {
        this.setState(prevState => {
            const interfacesChanged: NetworkInterface[] = JSON.parse(JSON.stringify(prevState.interfacesChanged));
            const index = interfacesChanged.findIndex(item => item.iface === prevState.tabValue);
            if (index === -1) {
                return null;
            }
            interfacesChanged[index] = {
                ...interfacesChanged[index],
                ...update,
            };
            return { interfacesChanged };
        });
    };

    resetInterfaceChanges = (iface: string): void => {
        this.setState(prevState => {
            const interfaces = prevState.interfaces || [];
            const source = interfaces.find(item => item.iface === iface);
            if (!source) {
                return null;
            }
            const interfacesChanged: NetworkInterface[] = JSON.parse(JSON.stringify(prevState.interfacesChanged));
            const index = interfacesChanged.findIndex(item => item.iface === iface);
            if (index === -1) {
                return null;
            }
            interfacesChanged[index] = JSON.parse(JSON.stringify(source));
            return { interfacesChanged };
        });
    };

    isInterfaceDirty = (iface: string): boolean => {
        const original = this.state.interfaces?.find(item => item.iface === iface);
        const changed = this.state.interfacesChanged?.find(item => item.iface === iface);
        if (!original || !changed) {
            return false;
        }
        return (
            JSON.stringify(App.normalizeInterfaceConfig(original)) !==
            JSON.stringify(App.normalizeInterfaceConfig(changed))
        );
    };

    canSaveInterface = (interfaceItem: NetworkInterface | null | undefined): boolean => {
        if (!interfaceItem?.editable || this.state.processing || !this.state.alive) {
            return false;
        }
        if (interfaceItem.type === 'wifi' && !interfaceItem.connection) {
            return false;
        }
        if (interfaceItem.dhcp) {
            return true;
        }
        return !!interfaceItem.configIp4?.trim() && !!interfaceItem.configIp4subnet?.trim();
    };

    async refreshCurrentSSID(): Promise<void> {
        const ifc = this.state.interfaces?.find(i => i.iface === this.state.tabValue);
        if (ifc?.type !== 'wifi' || !this.state.alive) {
            return new Promise<void>(resolve => this.setState({ wifiConnection: '' }, () => resolve()));
        }

        const wifiConnection = await this.socket.sendTo<string>(
            `wireless-settings.${this.instance}`,
            'wifiConnection',
            { iface: this.state.tabValue },
        );
        return new Promise<void>(resolve => this.setState({ wifiConnection }, () => resolve()));
    }

    refreshWiFi(): Promise<void> {
        if (this.scanWifiTimer) {
            clearTimeout(this.scanWifiTimer);
            this.scanWifiTimer = null;
        }

        const ifc = this.state.interfaces?.find(i => i.iface === this.state.tabValue);
        if (ifc?.type !== 'wifi' || !this.state.alive) {
            return new Promise<void>(resolve =>
                this.setState({ wifi: [], scanning: false, timeout: false }, () => resolve()),
            );
        }

        return new Promise<void>(resolve => {
            let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
                if (timer) {
                    timer = null;
                    this.setState({ timeout: true });
                    if (this.state.scanWifi) {
                        this.scanWifiTimer = setTimeout(() => {
                            this.scanWifiTimer = null;
                            void this.refreshWiFi();
                        }, 4000);
                    }
                    resolve();
                }
            }, 15000);

            this.setState({ scanning: true }, async () => {
                await this.refreshCurrentSSID();

                let wifi = await this.socket.sendTo<WirelessNetwork[]>(
                    `wireless-settings.${this.instance}`,
                    'wifi',
                    null,
                );
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }

                if (wifi.length) {
                    wifi = wifi
                        .filter(wifiNetwork => wifiNetwork.ssid.trim() !== '')
                        .sort((a, b) => {
                            const connectedA = a.ssid === this.state.wifiConnection;
                            const connectedB = b.ssid === this.state.wifiConnection;
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
                        void this.refreshWiFi();
                    }, 4000);
                }
            });
        });
    }

    async refresh(): Promise<void> {
        if (!this.state.alive) {
            return;
        }
        if (this.state.firstRequest === 0) {
            this.setState({ firstRequest: 1 });
        }
        let interfaces = await this.socket.sendTo<NetworkInterface[]>(
            `wireless-settings.${this.instance}`,
            'interfaces',
            null,
        );

        interfaces.sort((item1, item2) => (item1.mac > item2.mac ? -1 : 1));
        interfaces.sort((item1, item2) =>
            item1.type === 'wifi' && item2.type === 'wifi' ? 0 : item1.type === 'wifi' ? -1 : 1,
        );
        interfaces.sort((item1, item2) => (!item1.virtual && !item2.virtual ? 0 : !item1.virtual ? -1 : 1));
        interfaces = interfaces.filter(interfaceItem => interfaceItem.ip4 !== '127.0.0.1');

        let tabValue = this.state.tabValue;
        if (!interfaces.find(i => i.iface === tabValue)) {
            if (interfaces.find(i => i.iface === 'wlan0')) {
                tabValue = 'wlan0';
            } else {
                const wifiIface = interfaces.find(i => i.type === 'wifi');
                if (wifiIface) {
                    tabValue = wifiIface.iface;
                } else {
                    tabValue = interfaces[0]?.iface || '';
                }
            }
        }

        this.setState(
            {
                tabValue,
                interfaces,
                interfacesChanged: JSON.parse(JSON.stringify(interfaces)),
            },
            async () => {
                await this.refreshWiFi();
                this.setState({ firstRequest: 2 });
            },
        );
    }

    connect(ssid: string, password: string): void {
        if (!this.state.alive) {
            return;
        }
        this.setState({ processing: true }, () =>
            this.socket
                .sendTo<true | string>(`wireless-settings.${this.instance}`, 'wifiConnect', {
                    ssid,
                    password,
                    iface: this.state.tabValue,
                })
                .then(result => {
                    if (result === true) {
                        enqueueSnackbar(`${ssid} ${I18n.t('connected')}`, { variant: 'success' });
                    } else {
                        enqueueSnackbar(`${ssid} ${result}`, { variant: 'error' });
                    }
                    void this.refresh().then(() => this.setState({ processing: false }));
                }),
        );
    }

    disconnect(): void {
        if (!this.state.alive) {
            return;
        }
        this.setState({ processing: true }, () =>
            this.socket
                .sendTo<true | string>(`wireless-settings.${this.instance}`, 'wifiDisconnect', {
                    iface: this.state.tabValue,
                    ssid: this.state.wifiConnection || '',
                })
                .then(result => {
                    if (result === true) {
                        enqueueSnackbar(I18n.t('WI-FI disconnected'), { variant: 'success' });
                    } else {
                        enqueueSnackbar(result, { variant: 'error' });
                    }
                    void this.refresh().then(() => this.setState({ processing: false }));
                }),
        );
    }

    saveInterfaceConfig = (interfaceItem: NetworkInterface | null | undefined): void => {
        if (!this.state.alive || !interfaceItem) {
            return;
        }

        const payload = {
            iface: interfaceItem.iface,
            type: interfaceItem.type,
            dhcp: !!interfaceItem.dhcp,
            ip4: interfaceItem.configIp4 || '',
            ip4subnet: interfaceItem.configIp4subnet || '',
            gateway: interfaceItem.configGateway || '',
            dns: App.normalizeDnsList(interfaceItem.configDns),
        };

        this.setState({ processing: true }, () =>
            this.socket
                .sendTo<SetInterfaceConfigResult>(`wireless-settings.${this.instance}`, 'setInterfaceConfig', payload)
                .then(result => {
                    const success = result?.success === true;
                    const message = I18n.t(result?.message || 'Unable to save network settings');

                    if (success) {
                        enqueueSnackbar(message, { variant: 'success' });
                        this.setState(prevState => {
                            const apply = (item: NetworkInterface): NetworkInterface =>
                                item.iface !== interfaceItem.iface
                                    ? item
                                    : {
                                          ...item,
                                          dhcp: payload.dhcp,
                                          connection: result?.connection || item.connection,
                                          configIp4: payload.ip4,
                                          configIp4subnet: payload.ip4subnet,
                                          configGateway: payload.gateway,
                                          configDns: App.normalizeDnsList(payload.dns),
                                      };
                            const interfaces: NetworkInterface[] = JSON.parse(
                                JSON.stringify(prevState.interfaces || []),
                            ).map(apply);
                            const interfacesChanged: NetworkInterface[] = JSON.parse(
                                JSON.stringify(prevState.interfacesChanged || []),
                            ).map(apply);
                            return { interfaces, interfacesChanged, processing: false };
                        });

                        if (this.refreshTimer) {
                            clearTimeout(this.refreshTimer);
                        }
                        this.refreshTimer = setTimeout(() => {
                            this.refreshTimer = null;
                            this.refresh().catch(() => undefined);
                        }, 3000);
                    } else {
                        enqueueSnackbar(message, { variant: 'error' });
                        this.setState({ processing: false });
                    }
                })
                .catch(error => {
                    enqueueSnackbar(`${I18n.t('Unable to save network settings')}: ${error}`, {
                        variant: 'error',
                    });
                    this.setState({ processing: false });
                }),
        );
    };

    wifiPasswordApply(apply?: boolean): void {
        const ssid = this.state.wifiDialog;
        const wifiPassword = this.state.wifiDialogPassword;
        this.setState(
            {
                wifiDialog: false,
                wifiPasswordVisible: false,
                wifiDialogPassword: '',
            },
            () => {
                if (apply && ssid !== false) {
                    this.connect(ssid, wifiPassword);
                }
            },
        );
    }

    renderWifiDialog(): React.ReactElement {
        return (
            <Dialog
                open={this.state.wifiDialog !== false}
                onClose={() => this.wifiPasswordApply()}
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
                                                this.setState({
                                                    wifiPasswordVisible: !this.state.wifiPasswordVisible,
                                                })
                                            }
                                        >
                                            {this.state.wifiPasswordVisible ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                ) : null,
                            },
                        }}
                        onKeyUp={e => {
                            if (e.key === 'Enter') {
                                this.wifiPasswordApply(true);
                            }
                        }}
                        type={this.state.wifiPasswordVisible ? 'text' : 'password'}
                        label={I18n.t('WI-FI password')}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!this.state.wifiDialogPassword || !this.state.alive}
                        onClick={() => this.wifiPasswordApply(true)}
                    >
                        {I18n.t('Apply')}
                    </Button>
                    <Button
                        color="grey"
                        variant="contained"
                        onClick={() => this.wifiPasswordApply()}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    startWifiScan(enabled?: boolean, cb?: () => void): void {
        if (enabled === true) {
            this.setState({ scanWifi: true }, () => {
                void this.refreshWiFi();
                cb && cb();
            });
        } else if (enabled === false) {
            if (this.scanWifiTimer) {
                clearTimeout(this.scanWifiTimer);
                this.scanWifiTimer = null;
            }
            this.setState({ scanWifi: false }, () => cb && cb());
        } else {
            this.startWifiScan(!this.state.scanWifi, cb);
        }
    }

    static renderCurrentNetwork(interfaceItem: NetworkInterface): React.ReactElement {
        return (
            <div style={{ minWidth: 260, maxWidth: 380 }}>
                {(interfaceItem.ip4 || interfaceItem.ip6 || interfaceItem.dns?.length || interfaceItem.gateway) && (
                    <h4 style={{ marginTop: 8 }}>{I18n.t('Current network values')}</h4>
                )}
                {interfaceItem.ip4 ? (
                    <TextField
                        variant="standard"
                        style={styles.input}
                        value={interfaceItem.ip4}
                        label="IPv4"
                        disabled
                        fullWidth
                    />
                ) : null}
                {interfaceItem.ip4 ? (
                    <TextField
                        variant="standard"
                        style={styles.input}
                        value={interfaceItem.ip4subnet}
                        label="IPv4 netmask"
                        disabled
                        fullWidth
                    />
                ) : null}
                {interfaceItem.gateway ? (
                    <TextField
                        variant="standard"
                        style={styles.input}
                        value={interfaceItem.gateway}
                        label={I18n.t('Default gateway')}
                        disabled
                        fullWidth
                    />
                ) : null}
                {interfaceItem.ip6 ? <h4>IPv6</h4> : null}
                {interfaceItem.ip6 ? (
                    <TextField
                        variant="standard"
                        style={styles.input}
                        value={interfaceItem.ip6}
                        label="IPv6"
                        disabled
                        fullWidth
                    />
                ) : null}
                {interfaceItem.ip6 ? (
                    <TextField
                        variant="standard"
                        value={interfaceItem.ip6subnet}
                        label="IPv6 netmask"
                        disabled
                        fullWidth
                    />
                ) : null}
                {interfaceItem.dns?.length ? <h4>DNS</h4> : null}
                {interfaceItem.dns?.map((dnsRecord, dnsI) => (
                    <div key={dnsI}>
                        <TextField
                            variant="standard"
                            value={dnsRecord}
                            label={I18n.t('DNS record')}
                            disabled
                            fullWidth
                        />
                    </div>
                )) || null}
            </div>
        );
    }

    renderIpv4Editor(interfaceItem: NetworkInterface | null | undefined): React.ReactElement | null {
        if (
            !interfaceItem ||
            (interfaceItem.type !== 'ethernet' &&
                interfaceItem.type !== 'wifi' &&
                interfaceItem.type !== 'bridge' &&
                interfaceItem.type !== 'bond')
        ) {
            return null;
        }

        const dirty = this.isInterfaceDirty(interfaceItem.iface);
        const dnsText = App.normalizeDnsList(interfaceItem.configDns).join('\n');
        const masterIface = interfaceItem.slaveOf
            ? this.state.interfaces?.find(i => i.iface === interfaceItem.slaveOf)?.iface
            : undefined;

        return (
            <div style={{ minWidth: 300, maxWidth: 420 }}>
                <h4 style={{ marginTop: 8 }}>{I18n.t('IPv4 configuration')}</h4>
                {interfaceItem.connection ? (
                    <TextField
                        variant="standard"
                        style={styles.input}
                        value={interfaceItem.connection}
                        label={I18n.t('Connection profile')}
                        disabled
                        fullWidth
                    />
                ) : null}
                {interfaceItem.slaveOf ? (
                    <Alert
                        severity="info"
                        style={{ marginBottom: 12 }}
                        action={
                            masterIface ? (
                                <Button
                                    color="inherit"
                                    size="small"
                                    onClick={() => {
                                        this.setState({ tabValue: masterIface }, () => this.refreshWiFi());
                                        window.localStorage.setItem(`network.${this.instance}.tab`, masterIface);
                                    }}
                                >
                                    {I18n.t('Open master')}
                                </Button>
                            ) : undefined
                        }
                    >
                        {I18n.t('This interface is enslaved to %s. Edit that profile instead.', interfaceItem.slaveOf)}
                    </Alert>
                ) : !interfaceItem.editable ? (
                    <Alert
                        severity="info"
                        style={{ marginBottom: 12 }}
                    >
                        {I18n.t('This interface cannot be edited with NetworkManager')}
                    </Alert>
                ) : null}
                {interfaceItem.type === 'wifi' && !interfaceItem.connection ? (
                    <Alert
                        severity="info"
                        style={{ marginBottom: 12 }}
                    >
                        {I18n.t('Connect to a WI-FI network first to edit its IP settings')}
                    </Alert>
                ) : null}
                <FormControlLabel
                    style={{ marginLeft: 0, marginBottom: 8 }}
                    control={
                        <Switch
                            disabled={this.state.processing || !interfaceItem.editable}
                            checked={!!interfaceItem.dhcp}
                            onChange={e =>
                                this.updateEditedInterface({
                                    dhcp: e.target.checked,
                                    ...(e.target.checked
                                        ? {
                                              configIp4: '',
                                              configIp4subnet: '',
                                              configGateway: '',
                                          }
                                        : {}),
                                })
                            }
                        />
                    }
                    label={I18n.t('Use DHCP')}
                />
                <TextField
                    variant="standard"
                    style={styles.input}
                    value={interfaceItem.configIp4 || ''}
                    label={I18n.t('Static IPv4 address')}
                    disabled={this.state.processing || !!interfaceItem.dhcp || !interfaceItem.editable}
                    fullWidth
                    onChange={e => this.updateEditedInterface({ configIp4: e.target.value })}
                />
                <TextField
                    variant="standard"
                    style={styles.input}
                    value={interfaceItem.configIp4subnet || ''}
                    label={I18n.t('Subnet mask or prefix')}
                    disabled={this.state.processing || !!interfaceItem.dhcp || !interfaceItem.editable}
                    helperText={I18n.t('Examples: 255.255.255.0 or 24')}
                    fullWidth
                    onChange={e => this.updateEditedInterface({ configIp4subnet: e.target.value })}
                />
                <TextField
                    variant="standard"
                    style={styles.input}
                    value={interfaceItem.configGateway || ''}
                    label={I18n.t('Default gateway')}
                    disabled={this.state.processing || !!interfaceItem.dhcp || !interfaceItem.editable}
                    fullWidth
                    onChange={e => this.updateEditedInterface({ configGateway: e.target.value })}
                />
                <TextField
                    variant="standard"
                    style={styles.input}
                    value={dnsText}
                    label={I18n.t('DNS servers')}
                    helperText={I18n.t('One entry per line or separated by commas')}
                    disabled={this.state.processing || !interfaceItem.editable}
                    multiline
                    minRows={2}
                    fullWidth
                    onChange={e => this.updateEditedInterface({ configDns: App.normalizeDnsList(e.target.value) })}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!dirty || !this.canSaveInterface(interfaceItem)}
                        onClick={() => this.saveInterfaceConfig(interfaceItem)}
                    >
                        {I18n.t('Apply network settings')}
                    </Button>
                    <Button
                        variant="outlined"
                        color="grey"
                        disabled={!dirty || this.state.processing}
                        onClick={() => this.resetInterfaceChanges(interfaceItem.iface)}
                    >
                        {I18n.t('Reset changes')}
                    </Button>
                </div>
                <Alert
                    severity="warning"
                    style={{ marginTop: 16 }}
                >
                    {I18n.t(
                        'Applying network changes may interrupt the current connection. If the IP address changes, reopen the admin page using the new address.',
                    )}
                </Alert>
            </div>
        );
    }

    renderInterface(
        interfaceItem: NetworkInterface | undefined,
        editedInterface: NetworkInterface | undefined,
    ): React.ReactElement | null {
        if (!interfaceItem) {
            return null;
        }

        return (
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                {App.renderCurrentNetwork(interfaceItem)}
                {this.renderIpv4Editor(editedInterface || interfaceItem)}
                {this.renderWireless(interfaceItem)}
            </div>
        );
    }

    renderWireless(interfaceItem: NetworkInterface | null | undefined): React.ReactElement | null {
        if (interfaceItem?.type !== 'wifi') {
            return null;
        }

        return (
            <div style={{ minWidth: 260 }}>
                {this.state.processing || this.state.firstRequest < 2 ? (
                    <LinearProgress />
                ) : (
                    <div style={{ width: '100%', height: 4 }} />
                )}
                <FormControlLabel
                    style={{ marginLeft: 8 }}
                    control={
                        <Switch
                            disabled={this.state.processing || this.state.firstRequest < 2}
                            checked={this.state.scanWifi}
                            onChange={() => this.startWifiScan()}
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
        );
    }

    renderWifi(): React.ReactElement[] {
        return this.state.wifi.map((wifi, i) => {
            const connected = wifi.ssid === this.state.wifiConnection;
            return (
                <div key={i}>
                    <Button
                        variant={connected ? 'contained' : undefined}
                        color={connected ? 'primary' : 'grey'}
                        disabled={connected || this.state.processing || !this.state.alive}
                        title={connected ? '' : I18n.t('Click to connect')}
                        onClick={() =>
                            this.startWifiScan(false, () => {
                                if (wifi.security.includes('--')) {
                                    this.connect(wifi.ssid, '');
                                } else {
                                    this.setState({ wifiDialog: wifi.ssid });
                                }
                            })
                        }
                        style={{
                            position: 'relative',
                            paddingLeft: connected ? undefined : 16,
                            textTransform: 'inherit',
                        }}
                    >
                        <Tooltip title={`${wifi.quality} dBm`}>
                            {getWiFiIcon(wifi.security.includes('--'), wifi.quality)}
                        </Tooltip>
                        {wifi.ssid}
                        <div style={{ ...styles.speed, bottom: connected ? -2 : -5 }}>{wifi.speed}</div>
                    </Button>
                    {connected ? (
                        <Button
                            color="grey"
                            onClick={() => this.startWifiScan(false, () => this.disconnect())}
                            variant="outlined"
                            style={styles.buttonIcon}
                            disabled={this.state.processing || !this.state.alive}
                        >
                            {I18n.t('Disconnect')}
                        </Button>
                    ) : null}
                </div>
            );
        });
    }

    render(): React.ReactElement {
        if (!this.state.loaded) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader themeType={this.state.themeType} />
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
        const editedIndex = this.state.interfacesChanged.findIndex(i => i.iface === this.state.tabValue);

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
                            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                                <Tabs
                                    value={this.state.tabValue}
                                    onChange={(_e, value) => {
                                        this.setState({ tabValue: value }, () => this.refreshWiFi());
                                        window.localStorage.setItem(`network.${this.instance}.tab`, value);
                                    }}
                                    variant="scrollable"
                                    style={{ flexGrow: 1, minWidth: 0 }}
                                >
                                    {this.state.interfaces.map((interfaceItem, i) => (
                                        <Tab
                                            value={interfaceItem.iface}
                                            key={i}
                                            label={
                                                <div style={styles.tabLabel}>
                                                    {interfaceItem.type !== 'wifi' ? (
                                                        <SettingsInputComponentIcon
                                                            style={{
                                                                ...styles.buttonIcon,
                                                                ...(interfaceItem.status === 'connected'
                                                                    ? styles.connected
                                                                    : undefined),
                                                            }}
                                                        />
                                                    ) : (
                                                        <WifiIcon
                                                            style={{
                                                                ...styles.buttonIcon,
                                                                ...(interfaceItem.status === 'connected'
                                                                    ? styles.connected
                                                                    : undefined),
                                                            }}
                                                        />
                                                    )}
                                                    {interfaceItem.iface}
                                                </div>
                                            }
                                        />
                                    ))}
                                </Tabs>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '0 12px',
                                        flexShrink: 0,
                                    }}
                                >
                                    <Chip
                                        size="small"
                                        color={this.state.alive ? 'success' : 'default'}
                                        label={I18n.t(
                                            this.state.alive ? 'Adapter is running' : 'Adapter is not running',
                                        )}
                                    />
                                    <Tooltip title={I18n.t('Refresh')}>
                                        <span>
                                            <IconButton
                                                color="inherit"
                                                size="small"
                                                disabled={!this.state.alive || this.state.processing}
                                                onClick={() => this.refresh()}
                                            >
                                                <RefreshIcon />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </div>
                            </div>
                            {!this.state.interfaces.length ? I18n.t('No network interfaces detected!') : null}
                        </AppBar>

                        <div style={styles.tabContent}>
                            {!this.state.interfaces?.length && !this.state.alive
                                ? I18n.t('Instance is not running')
                                : null}
                            {interIndex !== -1 &&
                                this.renderInterface(
                                    this.state.interfaces[interIndex],
                                    editedIndex !== -1 ? this.state.interfacesChanged[editedIndex] : undefined,
                                )}
                        </div>
                        {this.renderWifiDialog()}
                    </div>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}
