const express = require('express');
const fetch = require('node-fetch');

require('dotenv').config();

const app = express();

const endpoint = 'https://www.transitchicago.com/traintracker/PredictionMap/tmTrains.aspx?line=R%2CP%2CY%2CB%2CV%2CG%2CT%2CO&MaxPredictions=200';

const actualLines = {
  'R': 'Red',
  'P': "Purple",
  'Y': 'Yellow',
  'B': 'Blue',
  'V': 'Pink',
  'G': 'Green',
  'T': 'Brown',
  'O': 'Orange',
}

let appData = {};

const calcAvgHeadway = (headways) => {
  if (headways.length === 1) return headways[0];

  const actualHeadways = headways.map((headway, i, arr) => {
    if (i === 0) return headway;
    return headway - arr[i - 1];
  })

  const totalHeadway = actualHeadways.reduce((a, b) => a + b, 0);
  return Math.round(totalHeadway / actualHeadways.length);
};

const processData = (data) => {
  if (data?.status !== 'OK') return {};

  let processedData = {
    lines: {},
    stations: {},
    interval: process.env.UPDATE_INTERVAL,
  };

  data.dataObject.forEach((line) => {
    let stations = {};
    let headways = {};

    line.Markers.forEach((train) => {
      if (train.IsSched) return;

      train.Predictions.forEach((prediction) => {
        const dest = train.DestName.split('&')[0];
        const eta = Number(prediction[2].replaceAll('Due', '1').replaceAll('<b>', '').replaceAll('</b>', '').split(' ')[0]);

        if (!isNaN(eta)) {
          if (!stations[prediction[1]]) {
            stations[prediction[1]] = {};
          };

          if (!stations[prediction[1]][dest]) {
            stations[prediction[1]][dest] = {
              headways: [],
              avgHeadway: 0,
            };
          };

          //adding headway to station
          stations[prediction[1]][dest].headways.push(eta);
        }
      });
    });

    //calculating average headway for each station
    Object.keys(stations).forEach((station) => {
      Object.keys(stations[station]).forEach((dest) => {
        stations[station][dest].avgHeadway = calcAvgHeadway(stations[station][dest].headways);

        if (!processedData.stations[station]) {
          processedData.stations[station] = {};
        }

        if (!processedData.stations[station][actualLines[line.Line]]) {
          processedData.stations[station][actualLines[line.Line]] = {};
        }
        processedData.stations[station][actualLines[line.Line]][dest] = stations[station][dest].avgHeadway;
      });
    });

    //calculating the average headway for each destination
    Object.keys(stations).forEach((station) => {
      Object.keys(stations[station]).forEach((dest) => {
        if (!headways[dest]) {
          headways[dest] = {
            headways: [],
            avgHeadway: 0,
          };
        };

        headways[dest].headways.push(stations[station][dest].avgHeadway);
      });
    });

    //calculating the average headway for each destination
    Object.keys(headways).forEach((dest) => {
      //console.log(headways[dest].headways)
      headways[dest] = Math.round(headways[dest].headways.reduce((a, b) => a + b, 0) / headways[dest].headways.length);
    });

    processedData.lines[actualLines[line.Line]] = headways;
    console.log('Data updated!')
  })

  appData = processedData;
};

const updateData = () => {
  fetch(endpoint)
    .then((response) => response.text())
    .then((data) => {
      const parsed = JSON.parse(data);
      processData(parsed);
      setTimeout(updateData, process.env.UPDATE_INTERVAL);
    })
    .catch((error) => {
      console.log(error);
    });
};

updateData();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/all', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(JSON.stringify(appData));
});

app.get('/updateInterval', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(process.env.UPDATE_INTERVAL);
});

app.listen(3000, () => {
  console.log('Server listening on port 3000');
});