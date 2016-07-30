var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');

var app = express();
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

var tokenstore = "http://localhost:3000/";
var tokens = [];

app.listen('3001', function (req, res) {
    console.log('Boss started at 3001. \nRegistering self as BOSS!');
    // register itself as boss
    request.post(tokenstore +'registerBoss', {form: {ip:'127.0.0.1', port: '3001'}}, function (err, httpResponse, body) {
        if (err) {
            return console.error('register boss failed:', err);
        }
        console.log('register boss successfull');

        // Get all tokens
        request.get(tokenstore +'get', function (err, httpResponse, body) {
            if (err) {
                return console.error('get tokens failed:', err);
            }
            tokens = JSON.parse(httpResponse.body);
            console.log('Retrieved ' +tokens.length +' tokens', tokens);

            // Now spawn workers corresponding to this tokens
        })
    });
});

app.post('/log', function (req, res) {
    
})


