/*globals google */
/*jshint esversion: 6 */
/*jshint unused:true */
/*exported login */

/**
 * Google API Login promise using Google Identity Services (GIS).
 * @param {string} clientId
 * @param {Array<Object>} apis
 * @returns {Promise<string>} Resolves with the access token.
 */
function login(clientId, apis) {

    let tokenClient;
    let accessToken = null;

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

    const signinDialog = () => new Promise((resolve, reject) => {
        const SIGN_IN_BUTTON_ID = 'google-signin-button';
        let dialog = document.getElementById(SIGN_IN_BUTTON_ID);

        // If we already have a valid token (and it's not expired - GIS handles this mostly by request),
        // but here we are designing for initial load.
        // We will just ask for a new token if we don't have one in memory.
        if (accessToken) {
             resolve(accessToken);
             return;
        }

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
                // Don't reject, allow retry
            } else {
                console.info('Token acquired.');
                accessToken = resp.access_token;
                if (dialog.open) {
                    dialog.close();
                }
                resolve(accessToken);
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
        .then(() => Promise.all([blockUntilDOMReady(), gisLoad(), chartLoad(apis)]))
        .then(() => {
            const scope = [...new Set(apis.filter(api => api.scopes).reduce((acc, api) => acc.concat(api.scopes), []))].join(' ');
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: scope,
                callback: () => {}, // Callback is handled in signinDialog
            });
        })
        .then(signinDialog)
        .then((token) => {
            console.info('Fully authorized and loaded libs, beginning app');
            console.timeEnd('Auth');
            console.groupEnd();
            return token;
        });
}
