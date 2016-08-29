var natural = require('natural');
var sprintf = require('sprintf').sprintf;
var data = require('../data/filter-issue-label.json');

var classifier = new natural.BayesClassifier();
var count = data.length;
var datasetSize = 5000;
var correct = 0;

data.slice(0, datasetSize).forEach(function(data, index) {
    classifier.addDocument(data.issue, data.label);
    if ((index && index % 100 == 0 || index == datasetSize - 1)) {
        console.log(sprintf("%d data added, progress: %s%%", index, (index / datasetSize * 100)));
    }
});
console.log(sprintf("%d dataset items added, starting to train...", datasetSize));
classifier.train();
console.log(sprintf("Training done, validating accuracy..."));

data.slice(datasetSize, datasetSize * 2).forEach(function(data, index) {
    var result = classifier.classify(data.issue);
    var match = (result == data.label);
    if (match) correct++;

    if ((index && index % 100 == 0 || index == datasetSize - 1)) {    
        console.log(sprintf("Verification Status: %s%%, Accuracy So Far: %s%%", (index / datasetSize * 100), (correct / index * 100)));
    }
});

console.log(sprintf("Accuracy: %s %%", (correct / datasetSize * 100)));