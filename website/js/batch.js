/*exported ThrottledBatch, persistentCoalesce */
/*jshint esversion: 8 */
/*jshint unused:true */

/**
 * Executes a batch of requests in parallel chunks.
 */
class ThrottledBatch {
    /**
     * @param {number} maxPerBatch - Number of concurrent requests (default 6 for browsers)
     * @param {number} waitTimeMs - Time to wait between chunks (ms)
     */
    constructor(maxPerBatch = 6, waitTimeMs = 1000) {
        this.maxPerBatch = maxPerBatch;
        this.waitTimeMs = waitTimeMs;
        this.queue = [];
        this.results = {};
    }

    /**
     * Add a request to the batch.
     * @param {string} url - The URL to fetch
     * @param {object} options - The fetch options (method, headers, etc.)
     * @param {string} id - Unique identifier for the request result
     */
    add(url, options, id) {
        this.queue.push({ url, options, id });
    }

    /** Work through the entire queue. */
    async execute() {
        console.info(`ThrottledBatch processing ${this.queue.length} requests with concurrency ${this.maxPerBatch}, wait time ${this.waitTimeMs}ms`);

        const processRequest = async (item) => {
            try {
                const response = await fetch(item.url, item.options);
                // Handle empty responses (like 204)
                let data = {};
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    data = await response.json();
                }

                if (!response.ok) {
                    return {
                        result: {
                            error: data.error || { code: response.status, message: response.statusText }
                        }
                    };
                }
                return { result: data };
            } catch (err) {
                console.error(`Error fetching ${item.id}`, err);
                return {
                    result: {
                        error: { code: 0, message: err.message || 'Network Error' }
                    }
                };
            }
        };

        const chunks = [];
        for (let i = 0; i < this.queue.length; i += this.maxPerBatch) {
            chunks.push(this.queue.slice(i, i + this.maxPerBatch));
        }

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            // Wait if not first chunk
            if (i > 0 && this.waitTimeMs > 0) {
                await new Promise(resolve => setTimeout(resolve, this.waitTimeMs));
            }

            console.info(`ThrottledBatch processing chunk ${i} of size ${chunk.length}`);
            const chunkPromises = chunk.map(item =>
                processRequest(item).then(res => {
                    this.results[item.id] = res;
                })
            );
            await Promise.all(chunkPromises);
        }

        return this.results;
    }

    toString() {
        return `ThrottledBatch{max:${this.maxPerBatch},wait:${this.waitTimeMs},queue:${this.queue.length}}`;
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
