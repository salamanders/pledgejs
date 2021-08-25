/*global gapi, login, google, ThrottledBatch, persistentCoalesce */
/*jshint esversion: 6 */
/*jshint unused:true */
/*jshint strict:true */
/*jshint -W097 */
"use strict";

const
    /** @type {boolean} */
    IS_PUBLIC = window.location.toString().includes('appspot'),
    /** @type {string} */
    CLIENT_ID = IS_PUBLIC ? "86475508105-7j240ho1u1kaiq3qfnv07finu3m5v8or.apps.googleusercontent.com" : "593562380651-0g80tgi1jqrfvaf427n6ilur6uflktna.apps.googleusercontent.com",
    /** @type {string} */
    API_KEY = IS_PUBLIC ? "AIzaSyAPKnarANiEQJyXR1aJD4-9kCahMBzMV7s" : "AIzaSyC4FAjLw2DK-fz68kuR44O5DoZ6SWp1SlY",
    APIS = [
        {
            gapi: 'oauth2',
            discovery: 'https://www.googleapis.com/discovery/v1/apis/oauth2/v2/rest',
            scopes: ['profile']
        },
        {
            gapi: 'drive',
            discovery: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            scopes: [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/drive.metadata.readonly'
            ]
        },
        {
            chart: 'corechart'
        },
        {
            chart: 'table'
        }
    ];

// Information that we encounter along the way.
const fileData = {}; // ID to Name lookup at the end

/** @type {?string} */
let myEmail = null; // Who the current user is
let bubbleDataTable = null; // For adding values to the bubble chart
let listDataTable = null; // For adding values to the document list

const oldestDate = new Date();
oldestDate.setFullYear(oldestDate.getFullYear() - 2);
const oldestDateString = oldestDate.toISOString();

/**
 * Guava-like key to array.  (duplicates in value array are ok)
 */
class Multimap {
    constructor() {
        this.counts = {};
    }

    put(key, elt) {
        if (!this.counts[key]) {
            this.counts[key] = [];
        }
        this.counts[key].push(elt);
    }
}

function processBatches(arr) {
    const batchComments = arr[0],
        batchRevisions = arr[1];

    // ID to rows of info
    const simpleBucket = new Multimap();

    // TODO: any less ugly way to write this code?
    console.info(`Repacking comments into a simpler object: ${Object.keys(batchComments).length}`);
    Object.keys(batchComments).forEach(fileId => {
        // console.error('commentResult', fileId, batchComments[fileId]);
        const commentResult = batchComments[fileId];
        if (commentResult.result.error) {
            console.error('Comment batch error:', fileId, commentResult.result.error);
            return;
        }
        if (commentResult.result.comments) {
            commentResult.result.comments
                .filter(comment =>
                    comment.author &&
                    (comment.author.emailAddress || comment.author.displayName) &&
                    comment.createdTime
                )
                .forEach(comment => {
                    /** @type {string} */
                    const commentKey = persistentCoalesce(
                        comment.author.emailAddress,
                        comment.author.displayName
                    );
                    simpleBucket.put(fileId, {
                        type: 'comment',
                        author: commentKey,
                        ts: comment.createdTime
                    });

                    if (comment.replies) {
                        comment.replies.filter(reply =>
                            reply.author &&
                            (reply.author.emailAddress || reply.author.displayName) &&
                            reply.createdTime
                        ).forEach(reply => {
                            /** @type {string} */
                            const replyKey = persistentCoalesce(
                                reply.author.emailAddress,
                                reply.author.displayName
                            );
                            simpleBucket.put(fileId, {
                                type: 'reply',
                                author: replyKey,
                                ts: reply.createdTime
                            });
                        });
                    }
                });
        }
    });

    console.log(`Investigating revision: ${Object.keys(batchRevisions).length}`);
    Object.keys(batchRevisions).forEach(/** @type {string} */fileId => {
        const revisionResult = batchRevisions[fileId];
        if (revisionResult.result.error) {
            console.error('Revision batch error:', fileId, revisionResult.result.error);
            return;
        }
        if (revisionResult.result.revisions) {
            revisionResult.result.revisions.filter(revision =>
                revision.lastModifyingUser &&
                (revision.lastModifyingUser.emailAddress || revision.lastModifyingUser.displayName) &&
                revision.modifiedTime
            ).forEach(revision => {
                /** @type {string} */
                const revisionKey = persistentCoalesce(
                    revision.lastModifyingUser.emailAddress,
                    revision.lastModifyingUser.displayName
                );
                simpleBucket.put(fileId, {
                    type: 'revision',
                    author: revisionKey,
                    ts: revision.modifiedTime
                });
            });
        }
    });
    return Promise.resolve(simpleBucket.counts);
}

function processCounts(counts) {
    const spinner = document.getElementById('spinner');
    spinner.parentNode.removeChild(spinner);

    console.log('counts', counts);

    const debugData = [];
    Object.keys(counts).forEach(fileId => {
        const maxDate = new Date(counts[fileId].reduce((max, elt) =>
            (myEmail === elt.author && elt.ts > max) ? elt.ts : max).ts
        );
        if(maxDate < oldestDate) {
            console.error(`Too old date for file ${fileId}, skipping.`);
            return;
        }
        const editCount = counts[fileId].length;

        // Real Name: Edits
        const contributors = {};
        counts[fileId].forEach(elt => {
            contributors[elt.author] = (contributors[elt.author] || 0) + 1;
        });

        const numCollaborators = Object.keys(contributors).length;
        let percentYou = Math.round(100 * contributors[myEmail] / editCount);
        // Work around annoying nulls, debug why later.
        if (!percentYou) {
            console.error('Unable to calculate self contribution percent', myEmail, editCount, contributors);
            percentYou = 0;
        }

        const newBubbleRow = [
            fileData[fileId].name,
            maxDate,
            editCount,
            percentYou,
            numCollaborators
        ];
        bubbleDataTable.addRow(newBubbleRow);

        // copy row data and replace first item to include document link
        const newListRow = [...newBubbleRow];
        newListRow[0] = `<a href="${fileData[fileId].link}" target="_blank">${fileData[fileId].name}</a>`;
        listDataTable.addRow(newListRow);

        debugData.push(newListRow);
    });

    console.log('debugData', JSON.stringify(debugData));

    const optionsBubble = {
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

    const bubbleChart = new google.visualization.BubbleChart(document.getElementById('bubble_chart_div'));
    bubbleChart.draw(bubbleDataTable, optionsBubble);


    const optionsTable = {
        showRowNumber: true,
        sortColumn: 0,
        allowHtml: true
    };
    const tableChart = new google.visualization.Table(document.getElementById('table_chart_div'));
    tableChart.draw(listDataTable, optionsTable);
}


/** Authorize, get 200 most recently modified files that you can edit */
login(API_KEY, CLIENT_ID, APIS)
    .then(() => {

        const profile = gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile();
        myEmail = persistentCoalesce(
            profile.getEmail(),
            profile.getName()
        );

        console.info('Auth myEmail:', myEmail);

        // Have to init here, after loading google.visualization
        bubbleDataTable = new google.visualization.DataTable();
        listDataTable = new google.visualization.DataTable();
        [bubbleDataTable, listDataTable].forEach(dataTable => {
            // Label, X, Y[, Color str or num], [Size num]
            dataTable.addColumn('string', 'Doc Name');
            dataTable.addColumn('date', 'Most Recent Edit');
            dataTable.addColumn('number', 'Edit Count');
            dataTable.addColumn('number', 'Percent You');
            dataTable.addColumn('number', 'Distinct Collaborators');
        });

        return gapi.client.drive.files.list({
            // https://developers.google.com/drive/v3/reference/files/list
            'corpora': 'allDrives',
            'supportsAllDrives': true,
            'pageSize': 200,
            'orderBy': 'modifiedByMeTime desc',
            'spaces': 'drive',
            'q': "'me' in writers" +
                " AND trashed=false" +
                ` AND viewedByMeTime>='${oldestDateString}'` +
                ` AND modifiedTime>='${oldestDateString}'` +
                " AND (mimeType='application/vnd.google-apps.document' OR mimeType='application/vnd.google-apps.presentation' OR mimeType='application/vnd.google-apps.spreadsheet')",
            'fields': 'files(capabilities/canEdit,description,id,kind,webViewLink,lastModifyingUser(displayName,me,emailAddress),name)'
        });
    })
    .then(resp => {
        console.info('Total files found:' + resp.result.files.length);
        console.info('File 0 example:' + JSON.stringify(resp.result.files[0]));

        resp.result.files.forEach(file => {

            if (file.lastModifyingUser) {
                // Extra lookups.
                persistentCoalesce(
                    file.lastModifyingUser.emailAddress,
                    file.lastModifyingUser.displayName
                );
            }
            fileData[file.id] = {
                name: file.name,
                link: file.webViewLink
            };
        });

        // commentBatch, one for each file.
        const commentBatch = new ThrottledBatch(20, 3000);
        resp.result.files.forEach(file => {
            commentBatch.add(gapi.client.drive.comments.list({
                fileId: file.id,
                includeDeleted: false,
                pageSize: 100, // TODO(behill): more comments? API quota limits?
                fields: 'comments(author(displayName,emailAddress),createdTime,replies(author(displayName,emailAddress),createdTime),resolved)'
            }), file.id);
        });

        // revisionBatch, one for each file. Same Quota issues.
        const revisionBatch = new ThrottledBatch(20, 3000);
        resp.result.files
            .filter(file => file.capabilities.canEdit)
            .forEach(file => {
                revisionBatch.add(gapi.client.drive.revisions.list({
                    fileId: file.id,
                    fields: 'revisions(lastModifyingUser(displayName,me,emailAddress),modifiedTime)'
                }), file.id);
            });

        // Get both batches in parallel. Possibly not good for rate limiting quotas.
        return Promise.all([commentBatch.execute(), revisionBatch.execute()]);
    })
    .then(processBatches)
    .then(processCounts)
    .catch(err => {
        alert('Uncaught error:' + err);
        throw err;
    });
