# pledge.js

What documents have you been collaborating on lately?

## Developing

    gcloud app deploy -q --project pledgejs --version 2 --verbosity=info app.yaml
    gcloud app deploy -q --project google.com:pledge --version 1 --verbosity=info app.yaml
    
Note: This doesn't work from `https://pledgejs.uc.r.appspot.com/` - you have to use https://pledgejs.appspot.com/ 
 
## TODO

- [ ] The 2-year date threshold is iffy, some docs show as too far in the past.
- [ ] Links to docs
- [ ] Still missing a bunch of data when getting just-name comment replies. "author":{"displayName":"The Person"}} 