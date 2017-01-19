/* global  Promise, google, gapi */
/*jshint esversion: 6, unused:true, strict:true, -W097 */
/*exported fetchStatus, fetchJson, loadCharts, authAndLoadPromise,  */
"use strict";

/**
 * pledge.js CLEANS up your PROMISES get it? Get it? (sigh) never mind.
 * 
 * <code> 
 * authAndLoadPromise(API_KEY, CLIENT_ID, [api1, api2...]).then(function() {
 *   console.info('PLEDGE SUCCESS!!!');
 * }).then(function(){
 *   // https://developers.google.com/drive/v3/reference/files/list
 *   return gapi.client.drive.files.list...
 * </code>
 */

/** fetch() promise chain helper */
function fetchStatus(response) {
  if (response.status >= 200 && response.status < 300) {
    return Promise.resolve(response);
  } else {
    return Promise.reject(new Error(response.statusText));
  }
}

/** fetch() promise chain helper */
function fetchJson(response) {
  return response.json();
}

/** Smart injection of a URL into the head, assuming a normal js or css suffix */
function injectHead(url, type) {
  return new Promise(function (resolve, reject) {
    let s = document.getElementsByTagName('script')[0],
      elt = null,
      switcher = type || url.split('.').reverse()[0].toLowerCase();

    switch (switcher) {
    case 'js':
    case 'script':
      elt = document.createElement('script');
      elt.type = 'text/javascript';
      elt.src = url;
      elt.onload = function () {
        console.info('injectHead inserted:', url, switcher, type);
        resolve();
      };
      s.parentNode.insertBefore(elt, s);
      break;
    case 'css':
    case 'stylesheet':
      elt = document.createElement('link');
      elt.rel = 'stylesheet';
      elt.href = url;
      s.parentNode.insertBefore(elt, s);
      console.info('injectHead inserted:', url, switcher, type);
      resolve();
      break;
    default:
      reject("Can't handle injectHead, try forcing the type:" + url + type);
    }
  });

}

/** google.charts.load as a promise */
function loadCharts(chartTypes) {
  return Promise.resolve().then(function () {
    return injectHead('https://www.gstatic.com/charts/loader.js');
  }).then(function () {
    return new Promise(function (resolve) {
      google.charts.setOnLoadCallback(function () {
        resolve('loadCharts:' + JSON.stringify(chartTypes));
      });
      google.charts.load('current', {
        'packages': [].concat(chartTypes)
      });
    });
  });
}

/** Can't do it 'normally' because you need to give it the onload parameter.  BOO! */
function lazyLoadGapi() {
  return new Promise(function (resolve, reject) {
    if (window.gapi) {
      console.info('lazyLoadGapiCallback: Already had gapi loaded.');
      resolve();
    } else {
      window.lazyLoadGapiCallback = function () {
        console.info('lazyLoadGapiCallback: done, gapi=' + JSON.stringify(Object.keys(gapi)));
        resolve();
      };
      console.info('lazyLoadGapiCallback: injecting client.js');
      // Ignore the "then-able" nature of injectHead, use the onload callback manually.
      injectHead('https://apis.google.com/js/client.js?onload=lazyLoadGapiCallback', 'script').catch(function (err) {
        console.error('Unable to inject client.js', err);
        reject(err);
      });
    }
  });
}

/** Mess with this list if you need different scopes, different APIs */
var PLEDGE_LATEST = {
  'profile': {
    'scopes': ['profile'],
    'gapi': 'oauth2',
    'version': 'v2'
  },
  'email': {
    'scopes': ['email'],
    'gapi': 'plus',
    'version': 'v1'
  },
  'plus': {
    'scopes': ['https://www.googleapis.com/auth/plus.me'],
    'gapi': 'plus',
    'version': 'v1'
  },
  'drive': {
    'scopes': [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ],
    'gapi': 'drive',
    'version': 'v3'
  },
  'calendar': {
    'scopes': ['https://www.googleapis.com/auth/calendar.readonly'],
    'gapi': 'calendar',
    'version': 'v3'
  },
  'gmail': {
    'scopes': ['https://www.googleapis.com/auth/gmail.modify'],
    'gapi': 'gmail',
    'version': 'v1'
  },
  'urlshortener': {
    'scopes': ['https://www.googleapis.com/auth/urlshortener'],
    'gapi': 'urlshortener',
    'version': 'v1'
  },
  'fusiontables': {
    'scopes': ['https://www.googleapis.com/auth/fusiontables'],
    'gapi': 'fusiontables',
    'version': 'v2'
  },
  'yt-analytics': {
    'scopes': ['https://www.googleapis.com/auth/yt-analytics'],
    'gapi': 'youtubeAnalytics',
    'version': 'v1'
  },
  'youtube': {
    'scopes': ['https://www.googleapis.com/auth/youtube'],
    'gapi': 'youtube',
    'version': 'v3'
  },
  'spreadsheets': {
    'scopes': ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    'gapi': 'sheets',
    'version': 'v4',
    'discovery': 'https://sheets.googleapis.com/$discovery/rest?version=v4'
  },
  'corechart': {
    'chart-package': 'corechart'
  },
  'table': {
    'chart-package': 'table'
  },
  'gantt': {
    'chart-package': 'gantt'
  }
};

/**
 * @param apiKey
 * @param clientId
 * @param apis
 *            Names of the api clients you want to use from LATEST, can be a regular API or a chart library
 */
function authAndLoadPromise(apiKey, clientId, apis = []) {
  // TODO: All scopes in https://developers.google.com/identity/protocols/googlescopes
  // TODO: and https://developers.google.com/+/web/api/rest/oauth#authorization-scopes
  let scopes = [];

  return Promise.resolve().then(function () {
    console.group();
    console.info('Starting load and auth process.');
    return lazyLoadGapi();
  }).then(function () {
    if (apiKey) {
      console.info('gapi.client.setApiKey:' + apiKey);
      gapi.client.setApiKey(apiKey);
    }

    let charts = [];
    let toLoadPromises = apis.map(function (api) {
      if (!PLEDGE_LATEST[api]) {
        console.log('Unable to find API in LATEST list, loading directly from gapi.load, hope your scope is ok!', api);
        return new Promise(function (resolve) {
          gapi.load(api, {
            'callback': resolve
          });
        });
      }
      if (PLEDGE_LATEST[api].discovery && PLEDGE_LATEST[api].scopes) {
        console.info('Found API in latest list (with discovery URL):' + api);
        scopes.push(...PLEDGE_LATEST[api].scopes);
        return gapi.client.load(PLEDGE_LATEST[api].discovery);
      }
      if (PLEDGE_LATEST[api].gapi && PLEDGE_LATEST[api].version && PLEDGE_LATEST[api].scopes) {
        console.info('Found API in latest list (with scopes and version):' + api);
        scopes.push(...PLEDGE_LATEST[api].scopes);
        return gapi.client.load(PLEDGE_LATEST[api].gapi, PLEDGE_LATEST[api].version);
      }
      // TODO: Load based on scope prefix matching, and ensure unique loading.
      if (PLEDGE_LATEST[api]['chart-package']) {
        console.info('Found API in Latest/Charts list' + api);
        // Not a pretty way to do a side-effect
        charts.push(PLEDGE_LATEST[api]['chart-package']);
        return;
      }
      return Promise.reject('Unable to handle:', api);
    });

    // Unique and sorted scopes
    scopes = scopes.sort().filter(function (item, pos, ary) {
      return !pos || item != ary[pos - 1];
    });

    if (charts && charts.length) {
      console.info('Also parallel loading charts:' + JSON.stringify(charts));
      toLoadPromises.push(loadCharts(charts));
    }

    return Promise.all(toLoadPromises);
  }).then(function (arr) {
    console.info('Loaded:' + arr.length);
    let optionsImmediateTrue = {
      'client_id': clientId,
      'scope': scopes.join(' '),
      'immediate': true
    };
    console.info('auth: Trying with immediate=true', optionsImmediateTrue);
    return gapi.auth.authorize(optionsImmediateTrue);
  }).catch(function (err) {
    console.warn('auth: trying immediate=false', err);

    return new Promise(function (resolve2) {
      let dialog = document.createElement('dialog'),
        instructions = document.createElement('p'),
        button = document.createElement('button');

      let buttonText = window.promiseButtonText ? window.promiseButtonText : "Authorize this app to interact with your personal Google information?";
      instructions.appendChild(document.createTextNode(buttonText));
      button.appendChild(document.createTextNode("Authorize"));
      button.onclick = function () {
        console.info('clicked auth button');
        if (dialog.open) {
          dialog.close();
        }
        resolve2();
      };

      dialog.appendChild(instructions);
      dialog.appendChild(button);
      document.body.appendChild(dialog);
      if (!dialog.open) {
        dialog.showModal();
      }
    }).then(function () {
      let optionsImmediateFalse = {
        'client_id': clientId,
        'scope': scopes.join(' '),
        'immediate': false
      };
      console.log('gapi.auth.authorize', optionsImmediateFalse);
      return gapi.auth.authorize(optionsImmediateFalse);
    }).catch(function (err) {
      console.groupEnd();
      throw err;
    });
  }).then(function () {
    console.info('autoAndLoadPromise: done, gapi=' + JSON.stringify(Object.keys(gapi)) + ', gapi.client=' + JSON.stringify(Object.keys(gapi.client)));
    console.groupEnd();
  });
}