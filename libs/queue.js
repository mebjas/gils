var Queue = function (threshold, cb) {
    this.store = [];

    this.cb = cb;
    this.threshold = threshold;
}

Queue.prototype.push = function(e) {
    this.store.push(e);
}

Queue.prototype.pop = function () {
    if (!this.length()) return null;

    // notify on threshold
    if (this.length() == this.threshold + 1 && this.cb != undefined)
        this.cb(this.length());

    return this.store.shift();
}

Queue.prototype.length = function() {
    return this.store.length;
}

Queue.prototype.setThreshold = function (cb) {
    this.cb = cb;
}

module.exports = Queue;