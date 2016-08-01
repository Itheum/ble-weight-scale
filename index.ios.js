import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  AlertIOS
} from 'react-native';

var noble = require('react-native-ble');

var Devices = require('./devices');
var measurementCharacteristicWeight = null;

class BleHackNative extends Component {
  constructor(props) {
    super(props);

    this.state = {
      deviceSeeker: 'Idle',
      deviceWeightState: 1,
      deviceLastReading: '',
      groupMode: 0 // 0 = off, 1 = on
    };

    this.readPeripheralDataWeight = this.readPeripheralDataWeight.bind(this);
    this.startScanning = this.startScanning.bind(this);
    this.stopScanning = this.stopScanning.bind(this);
    this.saveAndReset = this.saveAndReset.bind(this);
  }

  componentDidMount() {
    noble.on('stateChange', function(state) {
      console.log('stateChange = ' + state);

      if (state === 'poweredOn') {
        this.startScanning();
      }
      else {
        this.stopScanning();
      }
    }.bind(this));

    noble.on('discover', function(peripheral) {
      console.log('"' + peripheral.advertisement.localName + '" entered (RSSI ' + peripheral.rssi + ') ' + new Date());

      if (peripheral.advertisement.localName == Devices.localNameWeight) {

        this.stopScanning();

        console.log('found our target Weight peripheral');

        peripheral.connect(function(err) {
          peripheral.discoverServices([Devices.serviceUuidWeight], function(err, services) {
            services.forEach(function(service) {
              console.log('found our target Weight service:', service.uuid);
              service.discoverCharacteristics([], function(err, characteristics) {

                characteristics.forEach(function(characteristic) {
                  if (Devices.measurementCharacteristicUuidWeight == characteristic.uuid.toLowerCase()) {
                    console.log('found our target Weight characteristic:', characteristic.uuid);
                    measurementCharacteristicWeight = characteristic;

                    this.readPeripheralDataWeight();
                  }
                }.bind(this))
              }.bind(this))
            }.bind(this))
          }.bind(this))
        }.bind(this))
      }
    }.bind(this));
  }

  componentWillUnmount() {
    console.log('unmount');
  }

  groupModeGetActiveUser(adjustedReading) {
    AlertIOS.prompt(
      'Name of Patient',
      adjustedReading,
      [
        {text: 'Cancel', onPress: () => console.log('Cancel Pressed'), style: 'cancel'},
        {text: 'OK', onPress: name => {
            console.log('OK Pressed, name: ' + name)
            this.saveAndReset(adjustedReading, 2, name)
          }
        },
      ],
      'plain-text'
    );
  }

  buttonClicked(mode) {

    switch (mode) {
      case 1:
        // reset app
        this.resetApp();
        break;
      case 2:
        // toggle group mode
        if (this.state.groupMode == 0) {
            this.setState({
                groupMode: 1
            })
        }
        else {
          this.setState({
              groupMode: 0
          })
        }
        break;
    }
  }

  resetApp() {
    console.log('resetApp');

    this.setState({
      deviceSeeker: 'Idle',
      deviceWeightState: 1,
      deviceLastReading: '',
      groupMode: 0
    });

    this.stopScanning();

    setTimeout(function() {
      this.startScanning();
    }.bind(this), 4000);
  }

  startScanning() {
    console.log('scanning...');

    this.setState({
      deviceSeeker: 'Scanning'
    });

    noble.startScanning([], false);
  }

  stopScanning() {
    console.log('stop scanning...');

    this.setState({
      deviceSeeker: 'Idle'
    });

    noble.stopScanning();
  }

  readPeripheralDataWeight() {
    this.setState({
      deviceWeightState: 2,
      deviceSeeker: 'Paired - Weight'
    });

    measurementCharacteristicWeight.notify(true, function(error) {
      if (error) {
        console.log('readPeripheralDataWeight - notify error! ', error);
      }
    }.bind(this));

    measurementCharacteristicWeight.on('data', function(data, isNotification) {
      console.log('Success! Weight reading received = ');

      var rawData = data; // e.g. <Buffer 02 f0 0a e0 07 06 01 10 1d 3
      var targetReading = data.readUInt16LE(1); // skip 1 byte and extract UInitLE after that which is what we want
      var adjustedReading = targetReading * 0.005; // if it's KG then 0.005 resolution
      adjustedReading = adjustedReading.toString() + ' kg';

      console.log(adjustedReading);

      this.setState({
        deviceWeightState: 3,
        deviceLastReading: adjustedReading
      });

      if (this.state.groupMode == 1) {
        this.groupModeGetActiveUser(adjustedReading, 1);
      }
      else {
        this.saveAndReset(adjustedReading, 1);
      }

      this.startScanning();
    }.bind(this));
  }

  saveAndReset(adjustedReading, readingType, nameOfPatient) {
    var d = {
      'dateTime': new Date().getTime().toString(),
      'karuID': '1',
      'type': readingType.toString(),
      'value': adjustedReading
    };

    if (this.state.groupMode == 1 && nameOfPatient && nameOfPatient != '') {
      d['nameOfPatient'] = nameOfPatient;

      this.setState({
        deviceLastReading: nameOfPatient + "'s reading is '" + adjustedReading
      });
    }

    var searchParams = Object.keys(d).map((key) => {
      return encodeURIComponent(key) + '=' + encodeURIComponent(d[key]);
    }).join('&');

    fetch('https://young-inlet-6578.herokuapp.com/api/v1/karu/readings/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: searchParams
      })
      .then(function(res) {
          return res.json();
        }.bind(this))
      .then(function(resJson) {

        setTimeout(function() {
          switch (readingType) {
            case 1:
              this.setState({
                deviceWeightState: 1,
                deviceLastReading: "Saved"
              });
            break;

            case 2:
              this.setState({
                deviceLastReading: "Saved"
              });
            break;
          }

          setTimeout(function() {
            this.setState({
              deviceLastReading: ""
            });
          }.bind(this), 4000);
        }.bind(this), 10000);

      }.bind(this));
  }

  render() {
    var deviceBatteryStyle = styles.deviceBatteryGood;
    var deviceSeekerStyle = styles.deviceIdle;
    var deviceWeightStyle = styles.deviceIdle;

    var groupModeStatus = 'OFF';

    if (this.state.groupMode == 1) {
      groupModeStatus = 'ON'
    }
    else {
      groupModeStatus = 'OFF'
    }

    if (this.state.deviceSeeker == 'Scanning') {
      deviceSeekerStyle = styles.deviceWorking;
    }
    else if (this.state.deviceSeeker == 'Paired') {
      deviceSeekerStyle = styles.deviceReceived;
    }

    if (this.state.deviceWeightState == 2) {
      deviceWeightStyle = styles.deviceWorking;
    }
    else if (this.state.deviceWeightState == 3) {
      deviceWeightStyle = styles.deviceReceived;
    }

    return (
      <View style={styles.holder}>
        <View>
          <Text style={styles.lastReading}>{this.state.deviceLastReading}</Text>
        </View>
        <View style={styles.container}>
          <View>
            <TouchableHighlight
              style={styles.button}
              onPress={this.buttonClicked.bind(this, 1)}>
                <View style={styles.resetButStyle}>
                  <Text style={styles.buttonText}>Reset App</Text>
                </View>
            </TouchableHighlight>
          </View>
          <View>
            <TouchableHighlight
              style={styles.button}
              onPress={this.buttonClicked.bind(this, 2)}>
                <View style={styles.resetButStyle}>
                  <Text style={styles.buttonText}>Group Mode ({groupModeStatus})</Text>
                </View>
            </TouchableHighlight>
          </View>
          <View style={styles.leftOpts}>
            <View>
              <Text style={styles.instructions}>Battery</Text>
              <View style={deviceBatteryStyle}></View>
            </View>
            <View>
              <Text style={styles.instructions}>{this.state.deviceSeeker}</Text>
              <View style={deviceSeekerStyle}></View>
            </View>
          </View>
          <View style={styles.rightOpts}>
            <View>
              <Text style={styles.instructions}>Weight</Text>
              <View style={deviceWeightStyle}></View>
            </View>
          </View>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  holder: {
    flex: 1,
    backgroundColor: '#000000',
  },
  lastReading: {
    fontSize: 26,
    color: '#CCCCCC',
    padding: 5,
  },
  container: {
    flex: 1,
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  button: {
    padding: 5,
    backgroundColor: '#CCCCCC',
    marginRight: 10,
    height: 50,
  },
  buttonText: {
    fontSize: 6,
  },
  leftOpts: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  rightOpts: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end'
  },
  instructions: {
    color: '#CCCCCC',
    marginBottom: 34,
    marginRight: 8,
    fontSize: 8,
    width: 65,
    transform: [{rotate: '270deg'}],
    textAlign: 'left',
  },
  deviceBatteryGood: {
    backgroundColor: 'green',
    width: 50,
    height: 50,
    marginRight: 5
  },
  deviceBatteryCharge: {
    backgroundColor: 'orange',
    width: 50,
    height: 50,
    marginRight: 5
  },
  deviceBatteryLow: {
    backgroundColor: 'red',
    width: 50,
    height: 50,
    marginRight: 5
  },
  deviceIdle: {
    backgroundColor: 'blue',
    width: 50,
    height: 50
  },
  deviceWorking: {
    backgroundColor: 'orange',
    width: 50,
    height: 50
  },
  deviceReceived: {
    backgroundColor: 'green',
    width: 50,
    height: 50
  },
});

AppRegistry.registerComponent('BleHackNative', () => BleHackNative);

// https://css-tricks.com/snippets/css/a-guide-to-flexbox/
