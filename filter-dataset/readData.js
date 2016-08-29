var fs = require('fs');

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

function getFilesFromDatasetDir() {
    return getFiles('../dataset');
}

module.exports = getFilesFromDatasetDir;