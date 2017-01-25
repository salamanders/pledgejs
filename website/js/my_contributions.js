/*global gapi, authAndLoadPromise, google, ThrottledBatch */
/*jshint esversion: 6 */
/*jshint unused:true */
/*jshint strict:true */
/*jshint -W097 */
"use strict";

// Information that we encounter along the way.
let
  fileData = {}, // ID to Name lookup at the enn
  myInfo = null, // Who the current user is
  dataTable = null; // For adding values over time

// #######################
// BEGIN PLEDGE.JS EXAMPLE: the app-specific settings, and which APIs (from the Scopes) you plan on calling.


const IS_PUBLIC = window.location.toString().includes('appspot');

const CLIENT_ID = IS_PUBLIC ? "86475508105-rv2l17i7ov08hvbqb5id2j00t1lq37t9.apps.googleusercontent.com" : "593562380651-0g80tgi1jqrfvaf427n6ilur6uflktna.apps.googleusercontent.com",
  API_KEY = IS_PUBLIC ? "AIzaSyDIuVKZnWBtLSrxYTzM2pRspaZFfyNifpw" : "AIzaSyC4FAjLw2DK-fz68kuR44O5DoZ6SWp1SlY",
  APIS = ['drive', 'profile', 'email', 'corechart', 'table'];

console.info('const:', IS_PUBLIC, CLIENT_ID, API_KEY, APIS);

/** Check and clean up result of gapi.client.plus.people.get */
function processMyInfo(response) {
  if (!response.result || !response.result.emails || !response.result.emails[0].value) {
    Promise.reject('gapi.client.plus.people.get missing email:', response);
  } else {
    let me = response.result;
    me.emailAddress = me.emails[0].value;
    me.userName = me.emailAddress.split('@')[0];
    return Promise.resolve(me);
  }
}

/** Authorize, get 200 most recently modified files that you can edit */
authAndLoadPromise(API_KEY, CLIENT_ID, APIS).then(function () {
  console.info('PLEDGE SUCCESS!');
  return gapi.client.plus.people.get({
    'userId': 'me'
  });
}).then(processMyInfo).then(function (me) {
  myInfo = me;
  console.info('Got myInfo:', myInfo);

  // Have to init here, after loading google.visualization
  dataTable = new google.visualization.DataTable();
  // Label, X, Y[, Color str or num], [Size num]
  dataTable.addColumn('string', 'Doc Name');
  dataTable.addColumn('date', 'Most Recent Edit');
  dataTable.addColumn('number', 'Edit Count');
  dataTable.addColumn('number', 'Percent You');
  dataTable.addColumn('number', 'Distinct Collaborators');

}).then(function () {
  // https://developers.google.com/drive/v3/reference/files/list
  return gapi.client.drive.files.list({
    'corpus': 'user',
    'pageSize': 200,
    'orderBy': 'modifiedByMeTime desc',
    'spaces': 'drive',
    'q': "'me' in writers AND trashed=false AND (mimeType='application/vnd.google-apps.document' OR mimeType='application/vnd.google-apps.presentation' OR mimeType='application/vnd.google-apps.spreadsheet')",
    'fields': 'files(capabilities/canEdit,description,id,kind,webViewLink,lastModifyingUser(displayName,me,emailAddress),name)'
  });
}).then(function (resp) {
  console.info('Total files found:' + resp.result.files.length);
  console.info('File 0 example:' + JSON.stringify(resp.result.files[0]));

  // END PLEDGE.JS EXAMPLE
  //#######################

  resp.result.files.forEach(function (file) {
    fileData[file.id] = {
      'name': file.name
    };
  });

  // commentBatch, one for each file.
  let commentBatch = new ThrottledBatch(20, 3000);
  resp.result.files.forEach(function (file) {
    commentBatch.add(gapi.client.drive.comments.list({
      'fileId': file.id,
      'includeDeleted': false,
      'pageSize': 100, // TODO(behill): more comments? API quota limits?
      'fields': 'comments(author(displayName,emailAddress),createdTime,replies(author(displayName,emailAddress),createdTime),resolved)'
    }), file.id);
  });

  // revisionBatch, one for each file. Same Quota issues.
  let revisionBatch = new ThrottledBatch(20, 3000);
  resp.result.files.filter(function (file) {
    return file.capabilities.canEdit;
  }).forEach(function (file) {
    revisionBatch.add(gapi.client.drive.revisions.list({
      'fileId': file.id,
      'fields': 'revisions(lastModifyingUser(displayName,me,emailAddress),modifiedTime)'
    }), file.id);
  });

  // Get both batches in parallel. Possibly not good for rate limiting quotas.
  return Promise.all([commentBatch.execute(), revisionBatch.execute()]);
}).then(processBatches).then(function (counts) {
  let spinner = document.getElementById('spinner');
  spinner.parentNode.removeChild(spinner);

  console.log('counts', counts);

  let debugData = [];
  Object.keys(counts).forEach(function (fileId) {
    let maxDate = new Date(counts[fileId].reduce(function (max, elt) {
      return (myInfo.emailAddress == elt.emailAddress && elt.ts > max) ? elt.ts : max;
    }).ts);

    let editCount = counts[fileId].length;

    // Real Name: Edits
    let contributors = {};
    counts[fileId].forEach(function (elt) {
      contributors[elt.emailAddress] = (contributors[elt.emailAddress] || 0) + 1;
    });

    let numCollaborators = Object.keys(contributors).length;

    let percentYou = Math.round(100 * contributors[myInfo.emailAddress] / editCount);
    // Work around annoying nulls, debug why later.
    if (!percentYou) {
      console.error('Unable to calculate percent', myInfo, editCount, contributors);
      percentYou = 0;
    }

    let newRow = [
      fileData[fileId].name,
      maxDate,
      editCount,
      percentYou,
      numCollaborators
    ];
    dataTable.addRow(newRow);
    debugData.push(newRow);
  });

  console.log('debugData', JSON.stringify(debugData));

  let options = {
    title: 'Your Documents (Color=% you, Size=# Collaborators)',
    hAxis: {
      title: 'Last Modified Date'
    },
    vAxis: {
      title: '# Edits and Comments',
      logScale: true
    },
    // sizeAxis:{minValue: 5, maxSize: 20},
    bubble: {
      textStyle: {
        fontSize: 10
      }
    },
    chartArea: {
      left: 80,
      top: 80,
      width: '80%',
      height: '80%'
    }
  };

  let bubbleChart = new google.visualization.BubbleChart(document.getElementById('bubble_chart_div'));
  bubbleChart.draw(dataTable, options);

  let tableChart = new google.visualization.Table(document.getElementById('table_chart_div'));
  tableChart.draw(dataTable, {
    showRowNumber: true,
    sortColumn: 0
  });
}).catch(function (err) {
  alert('Uncaught error:' + err);
  throw err;
});

function processBatches(arr) {
  let batchComments = arr[0],
    batchRevisions = arr[1];
  //ID to rows of info
  let simpleBucket = {
    'counts': {},
    'push': function (key, elt) {
      if (!this.counts[key]) {
        this.counts[key] = [];
      }
      this.counts[key].push(elt);
    }
  };

  // TODO: any less ugly way to write this code?
  console.info('Repacking comments into a simpler object: ' + Object.keys(batchComments).length);
  Object.keys(batchComments).forEach(function (fileId) {
    // console.error('commentResult', fileId, batchComments[fileId]);
    let commentResult = batchComments[fileId];
    if (commentResult.result.error) {
      console.error('Comment batch error:', fileId, commentResult.result.error);
    } else {
      if (commentResult.result.comments) {
        commentResult.result.comments.forEach(function (comment) {
          if (comment.author && comment.createdTime) {
            // TODO: let commentAuthorId =  comment.author.emailAddress || comment.author.displayName;

            simpleBucket.push(fileId, {
              'type': 'comment',
              'emailAddress': comment.author.emailAddress,
              'ts': comment.createdTime
            });
            if (comment.replies) {
              comment.replies.forEach(function (reply) {
                if (reply.author && reply.author.emailAddress && reply.createdTime) {
                  simpleBucket.push(fileId, {
                    'type': 'reply',
                    'emailAddress': reply.author.emailAddress,
                    'ts': reply.createdTime
                  });
                } else {
                  console.error('Reply missing info:' + JSON.stringify(reply));
                }
              });
            }
          } else {
            console.error('Comment missing info:' + JSON.stringify(comment));
          }
        });
      }
    }
  });

  console.log('Investigating revision: ' + Object.keys(batchRevisions).length);
  // console.error(batchRevisions);
  Object.keys(batchRevisions).forEach(function (fileId) {
    let revisionResult = batchRevisions[fileId];
    if (revisionResult.result.error) {
      console.error('Revision batch error:', fileId, revisionResult.result.error);
    } else {
      if (revisionResult.result.revisions) {
        revisionResult.result.revisions.forEach(function (revision) {
          if (revision.lastModifyingUser && revision.lastModifyingUser.emailAddress && revision.modifiedTime) {
            simpleBucket.push(fileId, {
              'type': 'revision',
              'emailAddress': revision.lastModifyingUser.emailAddress,
              'ts': revision.modifiedTime
            });
          } else {
            console.error('Revision missing info:' + JSON.stringify(revision));
          }
        });
      }
    }
  });
  return Promise.resolve(simpleBucket.counts);
}