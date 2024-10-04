import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import pkg from '../package.json';

window.adapterName = 'network-settings';

console.log(`iobroker.${window.adapterName}@${pkg.version}`);

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App common={{}} />);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister();
