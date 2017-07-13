/* global gapi */
/*exported ThrottledBatch */
/*jshint esversion: 6 */
/*jshint unused:true */
/*jshint strict:true */

/**
* Doesn't wait for a reply before trying next batch.
* TODO: Stop on errors
*/
class ThrottledBatch {
  constructor(maxPerBatch = 25, waitTimeMs = 1000) {
    this.maxPerBatch = maxPerBatch;
    this.waitTimeMs = waitTimeMs;
    this.queue = {};
    this.results = {};
  }

  // Utility from http://stackoverflow.com/questions/8495687/split-array-into-chunks
  chunk(arr, n) {
    return Array.from(Array(Math.ceil(arr.length / n)), (_, i) => arr.slice(i * n, i * n + n));
  }

  /** Work through the entire queue. We don't care about ordering. */
  execute() {
    let batches = this.chunk(Object.keys(this.queue), this.maxPerBatch);
    console.info(`ThrottledBatch trying ${batches.length} batches, wait time ${this.waitTimeMs}ms`);
    return Promise.all(
      batches.map((batch, i) => {
        return new Promise(resolve => {
          setTimeout(() => {
            console.info(`ThrottledBatch calling batch { number:${i}, length:${batch.length} }`);
            let gbatch = gapi.client.newBatch();
            batch.forEach(id => gbatch.add(this.queue[id], {
              'id': id
            }));
            gbatch.then(batchResult => {
              console.info(`ThrottledBatch response for batch ${i}`);
              Object.assign(this.results, batchResult.result);
              resolve();
            });
          }, i * this.waitTimeMs);
        }).catch(err => {
          console.error(`Error with ThrottledBatch single batch ${i}`, err);
          throw err;
        });
      })
    ).then(() => {
      return this.results;
    }).catch(err => {
      console.error('Error with ThrottledBatch all:', err);
      throw err;
    });
  }

  /** Add a gapi call (promise) and optional ID. */
  add(p, id = (Object.keys(this.queue).length + 1)) {
    this.queue[id] = p;
  }

  toString() {
    return `ThrottledBatch{max:${this.maxPerBatch},wait:${this.waitTimeMs},queue:${Object.keys(this.queue).length}}`;
  }
}