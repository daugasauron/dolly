# Plan for overnight session 2026-08-31

## Commit, Push & Deploy

After the current shell improvement loop finishes and is stable, run some reggressions then commit push & deploy.

## Python

Create a separate dollyfile for python.

It should be based on default image.

Add python and create some custom implementation of pip, call it bonnie.

Base the custom pip implementation on the libcurl in the default env.

## Gamedev

Add raylib.

Add some cool dependencies that fit well within the environment to be able to utilize the framebuffer in a cool way.

I think box3d could be really cool to add to use raylib & box3d. Add some skill file with environment specific knowledge on working with this setup.

Make the demo A LOT better, if possible using raylib and box3d and create an interactive game.

## curl

I want libcurl to be awesome.

Make it as similar to normal curl as possible, flags etc. It should still be lean, and focus on HTTP.

## CORS

For the purpose of this environment, ideally CORS should just be ignored.

The sandbox should be considered unsafe anyways.

Research some available CORS proxies and think of some possible workarounds and add it to the pi system prompt (short).

## Storing/resuming sessions

I want it to be possible to save & resume sessions using some browser state.

All the state should be the MEMFS, so if that is compressed and stored in the browser (loclastorage? indexdb?) it should be possible?

I think when storing a session the user should be prompted for a name, and it should be possible to load by name using the url, something like:

dolly/load?session=mycoolsessionname

Only prompt for name on the first load, after that its persisted as a file or something ~/.dolly-session-name (include version).

After its named it should be convenient to autosave. Ctrl+Shift+S sounds nice?

## Dollyfile

I really like this part of the current project, but it can definitely be improved.

I want you to add comments to all the sources on where the actual artifact were sourced (git link + hash or url), and some description if they were changed.

I was thinking if it makes sense to add some concept of modules with requires/exports, for example exports could be "git" which means that after that, git is on the path. Do not implement this but I want to keep it in mind I think it could be nice, can reflect on it.

## Self knowledge

Add some skill file to pi for self improvement, link to github repo and more detailed knowledge of the code.

## Audit/docs

Go through all the docs and update them. The current ones are too wordy keep them to the point. Use figures and images to describe architecture.

I like that the documentation is separated into different docs.

I want the repo to be as clean as possible. Go through it and remove everything that does not add value. Each line of code in the repo should have a reason to be there.
