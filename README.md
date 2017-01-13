# pledge.js

_pledge.js CLEANS up your PROMISES get it? Get it? (sigh) never mind._

Fully self-contained promise-enabled auth check (and dialog box generation) 
to handle Google API's oAuth steps 
so you can use Google JavaScript APIs with a minimum of fuss.

Usage:

```
<script src="https://pledgejs.appspot.com/js/pledge.js"></script>
<script>
authAndLoadPromise(YOUR_API_KEY, YOUR_OPTIONAL_CLIENT_ID, ['drive', 'spreadsheets']).then(function() {
  // All your code goes here.
```

## Development

* TO RESET: https://security.google.com/settings/security/permissions?pli=1
* TO DEPLOY: gcloud app deploy -q --project pledgejs  --version 1 --verbosity=info app.yaml

## TODO
- [x] A map between SCOPES and gapi.client.load calls
- [x] handle jsapi `injectHead('//www.google.com/jsapi', 'script');` for charts
- [x] Auto-inject jsapi charts
- [ ] All the SCOPES
- [ ] Tell the user why you need those scopes