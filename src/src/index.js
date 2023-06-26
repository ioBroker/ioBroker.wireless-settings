/* eslint-disable */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import './index.css';
import { Theme, Utils } from '@iobroker/adapter-react-v5';
import App from './App';
import * as serviceWorker from './serviceWorker';
import pkg from '../package.json';

window.adapterName = 'network';
let themeName = Utils.getThemeName();

console.log(`iobroker.${window.adapterName}@${pkg.version} using theme "${themeName}"`);

function build() {
    const container = document.getElementById('root');
    const root = createRoot(container);

    return root.render(
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={Theme(themeName)}>
                <App
                    common={{}}
                    onThemeChange={_theme => {
                        themeName = _theme;
                        build();
                    }}
                />
            </ThemeProvider>
        </StyledEngineProvider>,
        document.getElementById('root'),
    );
}

build();

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister();
