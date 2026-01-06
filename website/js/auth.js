/*globals google */
/*jshint esversion: 6 */
/*jshint unused:true */
/*exported login, ACCESS_TOKEN */

let ACCESS_TOKEN = null;

/**
 * Google API Login promise using Google Identity Services (GIS).
 * @param {string} apiKey
 * @param {string} clientId
 * @param {Array<Object>} apis
 * @returns {Promise<string>} Resolves with the access token
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

        // If a token exists, we might not need the dialog (though token expiry is a thing)
        if (ACCESS_TOKEN) {
            console.info('User already has a token.');
            if (dialog && dialog.open) {
                dialog.close();
            }
            resolve(ACCESS_TOKEN);
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
                // Trigger the popup flow
                tokenClient.requestAccessToken({prompt: 'consent'});
            });
        }

        // The callback for tokenClient needs to resolve this promise.
        // But tokenClient is initialized in the previous step.
        // We can re-assign the callback here or handle it via a wrapper.
        // Actually, initTokenClient takes the callback. We'll handle resolution there.

        // However, we need to wait for the user to click and the flow to finish.
        // So we expose the resolve function to the callback.
        window._authResolve = resolve;

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

            return new Promise(resolve => {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: scope,
                    callback: (resp) => {
                        if (resp.error) {
                            console.error('GIS Error:', resp.error);
                            // Don't reject, let user try again
                            return;
                        }
                        console.info('Token acquired.');
                        ACCESS_TOKEN = resp.access_token;

                        const dialog = document.getElementById('google-signin-button');
                        if (dialog && dialog.open) {
                            dialog.close();
                        }

                        // If we are waiting in the dialog promise, resolve it.
                        if (window._authResolve) {
                            window._authResolve(ACCESS_TOKEN);
                            delete window._authResolve;
                        }
                        resolve(ACCESS_TOKEN);
                    },
                });

                // If we have a stored valid token (not implemented here but good practice), we could skip.
                // For now, always prompt or wait for user action if token is missing.
                resolve();
            });
        })
        .then(signinDialog)
        .then((token) => {
            console.info('Fully authorized and loaded libs, beginning app');
            console.timeEnd('Auth');
            console.groupEnd();
            return token || ACCESS_TOKEN;
        });
}
