# Clade II

## Description
Fully navigable networked video graphic score for contemporary music performance.
Generates music based on a MusicXML file. This is passed via JSON to the client which presents the music in notation through HTML5 canvas.
The entry point is server.js.
This piece uses Node.js, Express, and HTML5 
canvas to create a score which performers read off of in real time. The players go to a website to access the score and the performance is synced between the pages using the timesync and socket.io.

For an explanation of the composition see [index.html](index.html)
## Usage

1. First time, use `npm install` to install the required packagees.
2. Use `npm start` to start the server. This will generate a new version of the score. Performance notes and information about the composition is available in programNotes.html.
