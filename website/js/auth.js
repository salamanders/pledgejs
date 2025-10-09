/*globals gapi, google */
/*jshint esversion: 6 */
/*jshint unused:true */
/*exported login */

/**
 * Google API Login promise, migrating from gapi.auth2 to Google Identity Services.
 * @param {string} apiKey
 * @param {string} clientId
 * @param {Array<Object>} apis
 * @returns {Promise<void>}
 */
function login(apiKey, clientId, apis) {

    let tokenClient;

    const blockUntilDOMReady = () => new Promise(resolve => {
        if (document.readyState === 'complete') {
            resolve();
            return;
        }
        const onReady = () => {
            resolve();
            document.removeEventListener('DOMContentLoaded', onReady, true);
            window.removeEventListener('load', onReady, true);
        };
        document.addEventListener('DOMContentLoaded', onReady, true);
        window.addEventListener('load', onReady, true);
    });

    const gapiLoad = () => new Promise(resolve => {
        gapi.load('client', resolve);
    });

    const gisLoad = () => new Promise((resolve, reject) => {
        const start = performance.now();
        const check = () => {
            if (window.google && google.accounts && google.accounts.oauth2) {
                resolve();
            } else if (performance.now() - start > 10000) {
                reject(new Error('GIS library failed to load.'));
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });

    const chartLoad = (apis) => {
        const charts = apis.filter(api => api.chart).map(api => api.chart);
        if (charts.length > 0) {
            return google.charts.load('current', {
                packages: [].concat(charts)
            });
        }
        return Promise.resolve();
    };

    const signinDialog = () => new Promise(resolve => {
        const SIGN_IN_BUTTON_ID = 'google-signin-button';
        let dialog = document.getElementById(SIGN_IN_BUTTON_ID);

        // If a token exists, we might not need the dialog.
        if (gapi.client.getToken()) {
            console.info('User already has a token.');
            if (dialog && dialog.open) {
                dialog.close();
            }
            resolve();
            return;
        }

        // If no token, we need to show the sign-in button.
        console.info('User not signed-in, building the button.');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.id = SIGN_IN_BUTTON_ID;
            const button = document.createElement('button');
            button.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored';
            button.innerText = 'Sign In / Authorize';
            dialog.appendChild(button);
            document.body.appendChild(dialog);

            button.addEventListener('click', () => {
                tokenClient.requestAccessToken({prompt: 'consent'});
            });
        }

        tokenClient.callback = (resp) => {
            if (resp.error) {
                console.error('GIS Error:', resp.error);
                // Don't reject the promise, allow user to try again.
            } else {
                console.info('Token acquired.');
                if (dialog.open) {
                    dialog.close();
                }
                resolve();
            }
        };

        if (!dialog.open) {
            dialog.showModal();
        }
    });


    return Promise.resolve()
        .then(() => {
            console.group();
            console.time('Auth');
            console.info('Auth:beginning.');
        })
        .then(() => Promise.all([blockUntilDOMReady(), gapiLoad(), gisLoad(), chartLoad(apis)]))
        .then(() => {
            const discoveryDocs = apis.filter(api => api.discovery).map(api => api.discovery);
            return gapi.client.init({
                apiKey: apiKey,
                discoveryDocs: discoveryDocs,
            });
        })
        .then(() => {
            const scope = [...new Set(apis.filter(api => api.scopes).reduce((acc, api) => acc.concat(api.scopes), []))].join(' ');
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: scope,
                callback: () => {}, // Callback is handled in signinDialog
            });
        })
        .then(signinDialog)
        .then(() => {
            console.info('Fully authorized and loaded libs, beginning app');
            console.timeEnd('Auth');
            console.groupEnd();
        });
}
