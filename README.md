# Clade II

## Description
Fully navigable networked video graphic score for contemporary music performance.
Generates music based on a MusicXML file. This is passed via JSON to the client which presents the music in notation through HTML5 canvas.
The entry point is server.js.
This piece uses Node.js, Express, and HTML5 
canvas to create a score which performers read off of in real time. The players go to a website to access the score and the performance is synced between the pages using the timesync and socket.io.

For an explanation of the composition see [index.html](index.html), or go to localhost:3000
## Usage

1. First time, use `npm install` to install the required packagees.
2. Use `npm start` to start the server. This will generate a new version of the score.
3. By default the piece is hosted on localhost:3000. Go to this address in your browser. You will see a description of the composition and how to use the software.

## Video Sample
[Click this link](https://www.youtube.com/watch?v=53fH8jT8dQw) to view an excerpt of 28/78's performance of this piece on youtube.
