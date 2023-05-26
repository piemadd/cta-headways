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

const lineMeta = {
  'P': {
    loopLimit: 40460.0,
    postLoopAlt: 'Linden'
  },
  'V': {
    loopLimit: 41160.0,
    postLoopAlt: '54th/Cermak'
  },
  'T': {
    loopLimit: 40460.0,
    postLoopAlt: 'Kimball'
  },
  'O': {
    loopLimit: 41400.0,
    postLoopAlt: 'Midway'
  }
};

const additionalStops = {
  'B': {
    'Forest Park': 'UIC-Halsted',
  }
};

let appData = {};

const calcAvgHeadway = array => array.reduce((a, b) => a + b) / array.length;

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

      let stationPastLoop = false;

      train.Predictions.forEach((prediction, i, arr) => {
        let dest = train.DestName.split('&')[0];
        const eta = Number(prediction[2].replaceAll('Due', '1').replaceAll('<b>', '').replaceAll('</b>', '').split(' ')[0]);

        if (!isNaN(eta)) {
          //setting up station if it doesn't exist
          if (!stations[parseInt(prediction[0])]) {
            stations[parseInt(prediction[0])] = {
              dest: {},
              stationName: prediction[1],
            };
          };

          // changing destination if past station before loop
          if (stationPastLoop) {
            dest = lineMeta[line.Line].postLoopAlt;
          }

          //setting up destination if it doesn't exist
          if (!stations[parseInt(prediction[0])]['dest'][dest]) {
            stations[parseInt(prediction[0])]['dest'][dest] = {
              etas: [],
              headways: [],
              avgHeadway: 0,
              runNumbers: [],
            };
          };

          //adding headway to station
          stations[parseInt(prediction[0])]['dest'][dest].etas.push(eta);

          //adding run number to station
          stations[parseInt(prediction[0])]['dest'][dest].runNumbers.push(train.RunNumber);
        
          //if final station, adding headway to line
          if (i === arr.length - 1 || (lineMeta[line.Line] && prediction[0] == lineMeta[line.Line].loopLimit)) {
            if (!headways[dest]) {
              headways[dest] = {
                etas: [],
                headways: [],
                avgHeadway: 0,
                runNumbers: [],
              };
            };

            headways[dest].etas.push(eta);
            headways[dest].runNumbers.push(train.RunNumber);
          }

          if (additionalStops[line.Line] && additionalStops[line.Line][prediction[1]]) {
            if (!headways[additionalStops[line.Line][prediction[1]]]) {
              headways[additionalStops[line.Line][prediction[1]]] = {
                etas: [],
                headways: [],
                avgHeadway: 0,
                runNumbers: [],
              };
            }

            headways[additionalStops[line.Line][prediction[1]]].etas.push(eta);
            headways[additionalStops[line.Line][prediction[1]]].runNumbers.push(train.RunNumber);
          }
        }

        //checking if train is past loop
        if (lineMeta[line.Line] && prediction[0] == lineMeta[line.Line].loopLimit) {
          stationPastLoop = true;
        };
      });
    });

    //looping through stations
    Object.keys(stations).forEach((station) => {
      Object.keys(stations[station]['dest']).forEach((dest) => {
        //sorting ETAs
        stations[station]['dest'][dest].etas.sort((a, b) => a - b);

        //calculating headways
        stations[station]['dest'][dest].etas.forEach((eta, i, arr) => {
          if (i === 0) stations[station]['dest'][dest].headways.push(eta);
          else stations[station]['dest'][dest].headways.push(eta - arr[i - 1]);
        });

        //calculating average headway
        stations[station]['dest'][dest].avgHeadway = calcAvgHeadway(stations[station]['dest'][dest].headways);
      });
    });

    //looping through headways
    Object.keys(headways).forEach((dest) => {
      //sorting ETAs
      headways[dest].etas.sort((a, b) => a - b);

      //calculating headways
      headways[dest].etas.forEach((eta, i, arr) => {
        if (i === 0) headways[dest].headways.push(eta);
        else headways[dest].headways.push(eta - arr[i - 1]);
      });

      //calculating average headway
      headways[dest].avgHeadway = calcAvgHeadway(headways[dest].headways);
    });

    //adding stations to processedData
    Object.keys(stations).forEach((station) => {
      if (!processedData.stations[station]) {
        processedData.stations[station] = {
          stationName: stations[station].stationName,
          lines: {},
        };
      };

      processedData.stations[station].lines[actualLines[line.Line]] = stations[station].dest;
    });

    //adding headways to processedData
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