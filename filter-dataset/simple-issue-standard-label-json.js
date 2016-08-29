var fs = require('fs');
var rd = require('./readData.js');
var start = new Date().getTime();
var data = [];
var labelFreq = {};
var lastUpdate = start;
var outputFileName = 'simple-issue-standard-label-json.json';
var standardLabels = {
    'bug': true,
    'duplicate': true,
    'enhancement': true,
    'help wanted': true,
    'invalid': true,
    'question': true,
    'wontfix': true
};

var files = rd();
files.forEach(function(_file) {
    var lineReader = require('readline').createInterface({
        input: require('fs').createReadStream(_file)
    });

    lineReader.on('line', function (line) {
        try {
            var d = JSON.parse(line);
            if (!d.labels.length) return;
            d.labels.forEach(function(label) {
                // console.log(label);
                if (typeof standardLabels[label.name] == 'undefined') return;
                data.push({issue: d.issue, label: label.name});                      
                // console.log(label.name);

                if (typeof labelFreq[label.name] == 'undefined')
                    labelFreq[label.name] = 1;
                else labelFreq[label.name] = labelFreq[label.name] + 1;
            });

            lastUpdate = new Date().getTime();
        } catch (ex) {
            console.log(ex);
        }
    });
});


function checkForLastUpdateAndLog() {
    // diff by 5 seconds
    if (new Date().getTime() > lastUpdate + 5000) {
        // finish
        console.log(labelFreq);
        fs.writeFileSync(outputFileName, JSON.stringify(data));
    } else {
        console.log('current time: ', new Date().getTime());
        console.log('lastUpdate time: ', lastUpdate);
        console.log('Still working, no of entries = ', data.length);
        setTimeout(checkForLastUpdateAndLog, 5000);
    }
}

checkForLastUpdateAndLog();