var fs = require('fs');
var start = new Date().getTime();
var data = [];
var labelFreq = {};
var lastUpdate = start;

function getFiles (dir, files_){
    files_ = files_ || [];
    var files = fs.readdirSync(dir);
    for (var i in files){
        var name = dir + '/' + files[i];
        if (fs.statSync(name).isDirectory()){
            // skip
        } else {
            files_.push(name);
        }
    }
    return files_;
}

var files = getFiles('../dataset');
files.forEach(function(_file) {
    var lineReader = require('readline').createInterface({
        input: require('fs').createReadStream(_file)
    });

    lineReader.on('line', function (line) {
        try {
            var d = JSON.parse(line);
            if (!d.labels.length) return;
            d.labels.forEach(function(label) {
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
        fs.writeFileSync('filter-issue-label.json', JSON.stringify(data));
    } else {
        console.log('current time: ', new Date().getTime());
        console.log('lastUpdate time: ', lastUpdate);
        console.log('Still working, no of entries = ', data.length);
        setTimeout(checkForLastUpdateAndLog, 5000);
    }
}

checkForLastUpdateAndLog();