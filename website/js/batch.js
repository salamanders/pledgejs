/*globals ACCESS_TOKEN, API_KEY */
/*jshint esversion: 6 */
/*jshint unused:true */
/*exported ThrottledBatch, persistentCoalesce, fetchWithAuth */

/**
 * Helper to fetch with authorization headers.
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Response>}
 */
function fetchWithAuth(url, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    if (typeof ACCESS_TOKEN !== 'undefined' && ACCESS_TOKEN) {
        options.headers['Authorization'] = 'Bearer ' + ACCESS_TOKEN;
    }
    // Append API Key to URL if not already present
    const urlObj = new URL(url);
    if (typeof API_KEY !== 'undefined' && API_KEY && !urlObj.searchParams.has('key')) {
        urlObj.searchParams.append('key', API_KEY);
    }
    return fetch(urlObj.toString(), options);
}

/**
 * Manages concurrency for fetch requests.
 * Replaces the old gapi batch functionality.
 */
class ThrottledBatch {
    constructor(maxConcurrent = 5, waitTimeMs = 100) {
        this.maxConcurrent = maxConcurrent;
        this.waitTimeMs = waitTimeMs;
        this.queue = [];
        this.results = {};
        this.activeCount = 0;
    }

    /**
     * Add a request to the queue.
     * @param {string} url The URL to fetch.
     * @param {string} id The ID for the result map.
     */
    add(url, id) {
        this.queue.push({ url, id });
    }

    /**
     * Execute all queued requests with concurrency limit.
     * @returns {Promise<Object>} Map of id -> result (parsed JSON)
     */
    execute() {
        return new Promise((resolve, reject) => {
            const processQueue = () => {
                if (this.queue.length === 0 && this.activeCount === 0) {
                    resolve(this.results);
                    return;
                }

                while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
                    const item = this.queue.shift();
                    this.activeCount++;

                    console.info(`Fetching ${item.id} (Active: ${this.activeCount})`);

                    fetchWithAuth(item.url)
                        .then(resp => {
                            if (!resp.ok) {
                                console.error(`Error fetching ${item.id}: ${resp.statusText}`);
                                return { error: resp.statusText }; // Mimic gapi error structure somewhat?
                            }
                            return resp.json();
                        })
                        .then(data => {
                            this.results[item.id] = data; // Store standard JSON response
                        })
                        .catch(err => {
                            console.error(`Network error for ${item.id}:`, err);
                            this.results[item.id] = { error: err.message };
                        })
                        .finally(() => {
                            this.activeCount--;
                            setTimeout(processQueue, this.waitTimeMs); // Small delay before picking next
                        });
                }
            };
            processQueue();
        });
    }
}

const persistentCoalesceLookup = {};

/**
 * Return the first non-null arg.
 * Remember which values can be mapped to other values.
 * If a value can be mapped, it is.
 * eg: "null, a, b, c" returns a, and remembers that b maps to a, and c maps to a.
 * Don't make loops.
 *
 * Used to map fuzzy identifiers (names) to hard identifiers (emails)
 *
 * @param args multiple args, some of which may be null
 * @return {?string}
 */
function persistentCoalesce(...args) {
    let firstOkVal = null;
    for (const arg of args) {
        if (arg !== null) {
            if (firstOkVal === null) {
                firstOkVal = arg;
            }
            // Always set if empty, always set if not-self.
            if (!persistentCoalesceLookup.hasOwnProperty(arg) || firstOkVal !== arg) {
                persistentCoalesceLookup[arg] = firstOkVal;
            }
        }
    }
    // Roll up as much as possible
    let loops = 0;
    while (persistentCoalesceLookup.hasOwnProperty(firstOkVal) && persistentCoalesceLookup[firstOkVal] !== firstOkVal) {
        firstOkVal = persistentCoalesceLookup[firstOkVal];
        loops++;
        if (loops > 1000) {
            throw `persistentCoalesce fatal loop in ${firstOkVal} ${JSON.stringify(persistentCoalesceLookup)}`;
        }
    }
    return firstOkVal;
}
