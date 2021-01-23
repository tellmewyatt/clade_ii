var scrwidth = window.innerWidth*2;
var scrheight = window.innerHeight*2;
var Parts;
var totalTime;
var CompClock = 0;
var playCounter;
var countDownVal;
document.addEventListener('keydown', function(event) {
    console.log(event.keyCode);
	if(event.keyCode==13){
	}
	if(event.keyCode==27){
	}
});
class Part{
	constructor(pname, srange, trange, cnote, ncp, clef, transposition=0, num, pan, loop= false){
		this.idNum = num;
	}
}
function loadDoc(){
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {
			var localParts = JSON.parse(xhttp.responseText);
			console.log(localParts[0]);
			Parts = Object.assign(new Part(), localParts[0]);
			console.log(Parts);
			totalTime = Parts.goalNotes[Parts.goalNotes.length-1].time+Parts.goalNotes[Parts.goalNotes.length-1].hold;
			drawPieceProgress();
		}
	};
	xhttp.open("GET", "Parts.json", true);
	xhttp.send();
}
function setValues1(){
	var width = scrwidth;
	var height = scrheight;
	var am = 0;
	partNameFontSize = scrheight/40;
	partNameFont = partNameFontSize.toString().concat("px Academico");
	ctx = document.getElementById("canvas1");
	canvas1 = ctx.getContext("2d");
	ctx.width = scrwidth;
	ctx.height = scrheight;
	var stylewidth = (scrwidth/2).toString();
	var styleheight = (scrheight/2).toString();
	ctx.style.width = stylewidth.concat("px");
	ctx.style.height = styleheight.concat("px");
	canvas1.font= partNameFont;
}
function drawPieceProgress(){
	canvas1.fillStyle='white';
	canvas1.fillRect(0,0, 10000, 10000)
	for(var i in Parts.goalNotes){
		canvas1.fillStyle = 'black';
		canvas1.fillRect(Parts.goalNotes[i].time/totalTime*scrwidth, 0, 2, scrheight/45);
	}
	canvas1.fillStyle='red';
	canvas1.fillRect(0, 0, scrwidth*CompClock/totalTime, scrheight/150);
	canvas1.font = partNameFont;
	canvas1.fillText(CompClock, scrwidth*CompClock/totalTime, scrheight/40);
}
function setTime(event){
	var clickX = event.clientX*2;
	var clickY = event.clientY*2;
	if(clickY < scrheight/10){
		CompClock = Math.round(clickX/scrwidth*totalTime);
		var message = "CompClock," + CompClock.toString();
		console.log(message);
		socket.emit("message", message);
		drawPieceProgress();
	}
}
function incrementTime(){
	var d = new Date();
	console.log(d.getTime());
	if(countDownVal == 0){
		CompClock++;
		drawPieceProgress();
		document.getElementById('countDown').innerHTML = "PLAYING!<br/>";
	}else{
		document.getElementById('countDown').innerHTML = countDownVal;
		countDownVal--;
	}
}