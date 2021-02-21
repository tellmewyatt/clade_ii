// "Enter" to start playback "Esc" to stop, play is playback var
document.addEventListener('keydown', function(event) {
    console.log(event.keyCode);
	if(event.keyCode==13){
		socket.emit('message', "strtstp,"+ts.now().toString());
		//play = true;
	}
	if(event.keyCode==27){
		//play = false;
		socket.emit('message', "strtstp,stop");
	}
});
// FOR CLEFS: q = treble, l = bass, n = alto 
function setTime(){
	var clickX = event.clientX*2;
	var clickY = event.clientY*2
	if(clickY < scrheight/10){
		CompClock = Math.round(clickX/scrwidth*totalTime);
		for(i in Parts){
			Parts[i].checkClefs();
			Parts[i].nextNotes = [];
			Parts[i].nextNoteTimes = [];
		}
		socket.emit('message', "CompClock,"+CompClock.toString());
	}
}