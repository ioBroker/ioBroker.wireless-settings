![Logo](admin/telemetry.png)
# ioBroker.telemetry

[![NPM version](http://img.shields.io/npm/v/iobroker.telemetry.svg)](https://www.npmjs.com/package/iobroker.telemetry)
[![Downloads](https://img.shields.io/npm/dm/iobroker.telemetry.svg)](https://www.npmjs.com/package/iobroker.telemetry)
![Number of Installations (latest)](http://iobroker.live/badges/telemetry-installed.svg)
![Number of Installations (stable)](http://iobroker.live/badges/telemetry-stable.svg)
[![Dependency Status](https://img.shields.io/david/ioBroker/iobroker.telemetry.svg)](https://david-dm.org/ioBroker/iobroker.telemetry)
[![Known Vulnerabilities](https://snyk.io/test/github/ioBroker/ioBroker.telemetry/badge.svg)](https://snyk.io/test/github/ioBroker/ioBroker.telemetry)

[![NPM](https://nodei.co/npm/iobroker.telemetry.png?downloads=true)](https://nodei.co/npm/iobroker.telemetry/)

## telemetry adapter for ioBroker

This adapter is used to anonymously collect the data on the central server for scientific research

## Todo
- events and objects are in RAM
- hash IDs
- Update RAM objects on objectChanged (updated / deleted)
- Show lastEvent and events in hours (and update this info on state changed - `data.update`)
- add setTimeout for send events (don't forget to clean the timeout on unload)
- flash with green on update statistics only for according objects (by the update and on save)

## Preparation
Edit /etc/sudoers.d/iobroker (only visudo):
```
# User privilege specification
iobroker ALL=(root) NOPASSWD: /usr/sbin/iwlist scan
iobroker ALL=(root) NOPASSWD: /usr/sbin/ip addr flush wlan0
iobroker ALL=(root) NOPASSWD: /usr/sbin/ip addr flush eth0
iobroker ALL=(root) NOPASSWD: /usr/sbin/ifconfig wlan0 down
iobroker ALL=(root) NOPASSWD: /usr/sbin/ifconfig wlan0 up
iobroker ALL=(root) NOPASSWD: /usr/sbin/service dhcpcd restart
iobroker ALL=(root) NOPASSWD: /usr/bin/cp /etc/dhcpcd.conf /etc/dhcpcd.conf.bak
iobroker ALL=(root) NOPASSWD: /usr/bin/tee /etc/wpa_supplicant/wpa_supplicant.conf
iobroker ALL=(root) NOPASSWD: /usr/bin/tee /etc/dhcpcd.conf
```


## Todo
GUI: detect if adapter running and if not show according message

## Changelog
### 0.1.0 (2021-01-18)
* (ioBroker) fixed build scripts

### 0.0.1 (2021-01-18)
* (ioBroker) initial release

## License
MIT License

Copyright (c) 2021 bluefox <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
