var scale = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B",];
var diatonicscale = ["C","D","E","F","G","A","B",];
var Notes = [];
var totalTime = 1192;
// Set Note Values
for (var i=0; i< 127; i++){
	var octave = Math.trunc(i/12)-1;
	var note = scale[i%12] + octave;
	Notes.push(note);
}
// Canvas variables
var canvas;
var ctx;
var scrwidth = window.innerWidth*2;
var scrheight = window.innerHeight*2;
//Number of rows of instruments
var numlines = 0;
//space between rows
var systemspacing = 0;
// number of parts per line
var numperline = 3;
var partspace = 0;
// staff number of lines and space between lines
var stafflines = 5;
var staffspace = 15;
// top staff topline position
var margin = 0;
var marginR = 0;
var lineThickness = 1;

// Information for drawing staves
var staffLineSpacing = 15;
var noteFontSize = 4*staffLineSpacing;
var noteFontSize = noteFontSize.toString();
var noteFont =  noteFontSize.concat("px feta26");
var clefFontSize = 4*staffLineSpacing;
var clefFontSize = clefFontSize.toString();
var clefFont =  clefFontSize.concat("px Clefs");
var ledgerLineThickness = staffLineSpacing;
var accidentalspace = staffLineSpacing*2;
var staffWidth;
var nextNoteInter;

// Main array that contains all of the Parts:
var Parts = [];
// Target Framerate
var framerate = 40;
// ts is the timesync server variables
var ts;
// This is the time, since the beginning of the animation, of the previous frame
var prevFrame;
// Milliseconds counted until it reaches 1000. Used to determine when to request new data from wWorker.
var msCount = 0;
// Creates a WebWorker that performs calculations outside of
var wWorker = new Worker('worker1.js');
var workerReturn;
var setT = false;
var midiTF = false;
wWorker.onmessage = function(e){
	workerReturn = [];
	workerReturn = e.data;
	if(setT){
		setNotes();
		doFrame();
		setT = false;
	}
}
// "Enter" to start playback "Esc" to stop, play is playback var
var play = false;
// time syncing stuff
var tsSet = false;
var timeOffset = 0;
// FOR CLEFS: q = treble, l = bass, n = alto 
// Load Canvas and Context
function setUpMIDI(){
	WebMidi.enable(function (err) {
		if (err) {
			console.log("WebMidi could not be enabled.", err);
		} else {
			console.log("WebMidi enabled!");
			midiOut = WebMidi.outputs[0];
			console.log("Recording on Output:", WebMidi.outputs[0]);
		}
	});
}
function setValues1(width,height){
	var am = 0;
	canvas = document.getElementById("canvas1");
	ctx = canvas.getContext("2d");
	partNameFontSize = scrheight/40;
	partNameFont = partNameFontSize.toString().concat("px Academico");
	canvas.width = scrwidth;
	canvas.height = scrheight;
	var stylewidth = (scrwidth/2).toString();
	var styleheight = (scrheight/2).toString();
	canvas.style.width = stylewidth.concat("px");
	canvas.style.height = styleheight.concat("px");
	ctx.font= partNameFont;
	staffLineSpacing = scrheight/90;
	noteFontSize = 4*staffLineSpacing;
	noteFontSize = noteFontSize.toString();
	noteFont =  noteFontSize.concat("px feta26");
	clefFontSize = 4*staffLineSpacing;
	clefFontSize = clefFontSize.toString();
	clefFont =  clefFontSize.concat("px Clefs");
	ledgerLineThickness = staffLineSpacing;
	accidentalspace = staffLineSpacing*2;
	loadDoc();
	setUpMIDI();
}
function setPartPositions(){
	var am = 0;
	// horizontal space between parts
	partspace = scrwidth/(numperline+1);
	// number of lines
	numlines = Math.ceil(Parts.length/numperline)+1;
	systemspacing=scrheight/numlines;
	var counter = 1;
	var line = Math.ceil(counter/numperline);
	margin = 0.5*partspace;
	marginR = scrwidth-0.5*partspace;
	var columnNum = 0;
	var diff = (stafflines/2)*staffspace+(systemspacing/5);
	var liney = systemspacing+(systemspacing/2)- diff;
	for (part in Parts){
		var newline = line;
		line = Math.ceil(counter/numperline);
		if(line - newline > 0){
			am = 0;
			columnNum = 0;
		}
		Parts[part].currentNoteX = staffLineSpacing*6;
		Parts[part].staffx = margin+am;
		staffWidth = partspace-staffLineSpacing*3;
		nextNoteInter = staffWidth-staffLineSpacing*9;
		Parts[part].row = line-1;
		Parts[part].staffy = (line)*(systemspacing);
		Parts[part].column = columnNum;
		if(Parts[part].clef == "q"){
			Parts[part].clefY = Parts[part].staffy+staffLineSpacing*3;
		}
		if(Parts[part].clef == "l"){
			Parts[part].clefY = Parts[part].staffy+staffLineSpacing*3.25;
		}
		if(Parts[part].clef == "n"){
			Parts[part].clefY = Parts[part].staffy+staffLineSpacing*3.2;
		}
		
		am = am+partspace;
		counter+=1;
		columnNum+=1;
	}
}
// Calculate Point from X for Envelopes
function calcPointFromX(xnew, x1,y1, x2,y2){
	var newy = ((y1 - y2)/(x1 - x2))*(xnew - x1) + y1;
	return newy
}

// Part Class
class Part{
	constructor(pname, clef, transposition=0, num){
		this.name = pname;
		this.clef=clef;
		this.currentNoteX=0;
		this.nextNoteX=0;
		this.xPosition = 0;
		this.row = 0;
		this.column = 0;
		this.sequence = [];
		this.nextNotes = [];
		this.nextNoteTimes = [];
		this.timerWidth = 0;
		this.staffx = 400;
		this.staffy = 400;
		this.transposition = transposition;
		this.rhythms = [];
		this.currentEnvs = [];
		this.idNum = num;
		this.cStruct;
		this.cNoteX;
		this.cNoteY;
		this.clefX;
		this.clefY;
		this.altClefSet = false;
		this.octva = false;
		this.octvb = false;
		this.changeClefText ="";
		this.changeClefTextY;
	}
	drawNote(pitch="B1", xPosi=300){
		var clef= this.clef;
		var pitchcut = pitch.split("");
		var xPos = xPosi+this.staffx;
		ctx.fillStyle="black";
		var noteVals = this.getNoteValues(pitch);
		ctx.font = noteFont;
		ctx.fillText("T",xPos, noteVals[0]);
		this.drawLedgerLines(noteVals[1], noteVals[2], xPosi);
		if(pitchcut[1] == "#"){
			ctx.fillText(".", xPos-accidentalspace, noteVals[0]);
		}else if(pitchcut[1] == "b"){
			ctx.fillText(":", xPos-accidentalspace, noteVals[0]);
		}else{
			ctx.fillText("6",xPos-accidentalspace, noteVals[0]);
		}
	}
	getNoteValues(pitch){
		// Returns y position, including staffy, number of ledger lines, and their position
		var octvTrans = 0;
		if(this.octva == true){
			octvTrans = -1;
		}
		if(this.octvb == true){
			octvTrans = 1;
		}
		var clef= this.clef;
		var pitchcut = pitch.split("");
		var ypos;
		var octaveDisplacement = pitchcut[pitchcut.length-1]-4+octvTrans;
		var notepos = diatonicscale.indexOf(pitchcut[0])+(octaveDisplacement*7);
		var llines = 0;
		var abvbl = false;
		ctx.fillStyle="black";
		if(clef=="q"){
			ypos = staffLineSpacing*(10-notepos)/2;
			if(notepos<=0){
				llines =  ~~((-notepos)/2)+1;
				abvbl = false;
			}if(notepos>=12){
				llines = ~~((notepos-12)/2)+1;
				abvbl = true;
			}
		}if(clef=="l"){
			notepos = notepos-1;
			var accidentalShift = staffLineSpacing*(-3-notepos)/2;
			ypos = accidentalShift;
			if(notepos>=-1){
				llines =  ~~((notepos+1)/2)+1;
				abvbl = true;
			}if(notepos<=-13){
				llines =  ~~((-notepos-13)/2)+1;
				abvbl = false;
			}
			
		}
		if(clef == "n"){
			notepos = notepos-7;
			var accidentalShift = staffLineSpacing*(-3-notepos)/2;
			ypos = accidentalShift;
			if(notepos>=-1){
				llines =  ~~((notepos+1)/2)+1;
				abvbl = true;
			}if(notepos<=-13){
				llines =  ~~((-notepos-13)/2)+1;
				abvbl = false;
			}
		}
		var retArr = [ypos+this.staffy, llines, abvbl];
		return retArr;
	}
	getNoteY(pitch){
		var clef= this.clef;
		var pitchcut = pitch.split("");
		var ypos;
		ctx.fillStyle="black";
		if(clef=="q"){
			var octaveDisplacement = pitchcut[pitchcut.length-1]-4;
			var notepos = diatonicscale.indexOf(pitchcut[0])+(octaveDisplacement*7);
			ypos = this.staffLineSpacing*(10-notepos)/2;
		}if(clef=="l"){
			var octaveDisplacement = pitchcut[pitchcut.length-1]-4;
			var notepos = diatonicscale.indexOf(pitchcut[0])+(octaveDisplacement*7)-1;
			ypos = this.staffLineSpacing*(-3-notepos)/2;
		}
		if(clef == "n"){
			var octaveDisplacement = pitchcut[pitchcut.length-1]-4;
			var notepos = diatonicscale.indexOf(pitchcut[0])+(octaveDisplacement*7)-7;
			ypos = this.staffLineSpacing*(-3-notepos)/2;
		}
		return ypos;
	}
	drawStaffLines(){
		ctx.strokeStyle="black";
		for(var i=0; i< 5; i++){
			ctx.beginPath();
			ctx.moveTo(this.staffx, this.staffy+i*staffLineSpacing)
			ctx.lineTo(this.staffx+staffWidth, this.staffy+i*staffLineSpacing);
			ctx.stroke();
		}
	}
	drawClef(){
		ctx.fillStyle = "black";
		ctx.strokeStyle = "black";
		ctx.font=clefFont;
		var margi1=staffLineSpacing/2;
		ctx.fillText(this.clef, this.staffx+margi1, this.clefY);
		if(this.octva == true){
			this.writeStaffText("8va", staffLineSpacing*4, 4*staffLineSpacing);
			this.drawDashedLine(ctx.measureText("8va").width+staffLineSpacing*4, 4*staffLineSpacing, this.staffWidth);
		}
		if(this.octvb == true){
			this.writeStaffText("8vb", this.currentNoteX , -9*staffLineSpacing);
			this.drawDashedLine(ctx.measureText("8vb").width+staffLineSpacing*4, 4*staffLineSpacing, this.staffWidth);
		}
		if(this.changeClefText != ""){
			//console.log(this.changeClefText);
			
			this.writeStaffText(this.changeClefText, this.currentNoteX, this.changeClefY, "red");
		}
	}
	drawDashedLine(x,y, end){
		ctx.setLineDash([5, 5]);/*dashes are 5px and spaces are 3px*/
		ctx.beginPath();
		ctx.moveTo(this.staffx+x,this.staffy-y);
		ctx.lineTo(this.staffx+end, this.staffy-y);
		ctx.stroke();
		ctx.setLineDash([]);
	}
	drawLedgerLines(num, abvblw, xPos){
		// abvblw  -> true = Above and false = Below
		for(var line=1; line <= num; line++){
			if(abvblw){
				var ypos = this.staffy-line*staffLineSpacing;
				var xPosrel = xPos+this.staffx
			}
			if(!abvblw){
				var ypos = this.staffy+staffLineSpacing*(4+line);
				var xPosrel = xPos+this.staffx;
			}
			ctx.beginPath();
			ctx.moveTo(xPosrel-ledgerLineThickness*3/4, ypos);
			ctx.lineTo(xPosrel+ledgerLineThickness*2.75,ypos);
			ctx.stroke();
		}
	}
	drawName(){
		ctx.fillStyle = "black";
		ctx.font = partNameFont;
		var textWidth = ctx.measureText(this.name).width;
		var textmargin = staffLineSpacing;
		ctx.fillText(this.name, this.staffx-staffLineSpacing*2, this.staffy-partNameFontSize/*+2.75*staffLineSpacing*/);
	}
	drawPart(special = false){
		this.drawEnvs();
		this.drawEnvLines();
		this.drawStaffLines();
		if(this.currentNote != "r"){
			this.drawNote(this.currentNote, this.currentNoteX);
		}
		this.drawClef();
		this.drawName();
		this.drawNextNotes();
	}
	drawNextNotes(){
		for(var i=0; i<this.nextNotes.length; i++){
			var xpos = nextNoteInter*(this.nextNoteTimes[i]/5)+6*staffLineSpacing;
			if(this.nextNotes[i] != "r"){
				this.drawNote(this.nextNotes[i], xpos);
			}else{
				this.drawRest(xpos);
			}
		}
	}
	writeStaffText(text, xpos, ypos, color = "black"){
		ctx.font = partNameFont;
		ctx.fillStyle= color;
		ctx.fillText(text, this.staffx+xpos, this.staffy-ypos);
	}
	drawEnvs(){
		if(this.currentEnvs !== undefined){
			for(var i = 0; i<this.currentEnvs.length; i++){
				if(!this.currentEnvs[i][1]){
					try{
						for(var b =0; b<this.rhythms[this.currentEnvs[i][0]].units.length; b++){
							var yvar = ((this.currentEnvTs[i]+this.rhythms[this.currentEnvs[i][0]].units[b].time)/5)
								*(staffWidth-this.currentNoteX-staffLineSpacing*3);
							this.drawEnv(this.rhythms[this.currentEnvs[i][0]].units[b], yvar);
						}
					}catch{
						console.log("ERROR:", this.idNum, this.currentEnvTs[i], this.currentEnvs[i][0],this.rhythms[this.currentEnvs[i][0]]);
					}
				}else{
					try{
						for(var b =0; b<this.rhythms[this.currentEnvs[i][0]].endUnits.length; b++){
							var yvar = ((this.currentEnvTs[i]+this.rhythms[this.currentEnvs[i][0]].endUnits[b].time)/5)
								*(staffWidth-this.currentNoteX-staffLineSpacing*3);
							this.drawEnv(this.rhythms[this.currentEnvs[i][0]].endUnits[b], yvar);
						}
					}catch{
						console.log("ERROR:", this.idNum, this.currentEnvTs[i], this.currentEnvs[i][0],this.rhythms[this.currentEnvs[i][0]]);
					}
				}
			}
		}
	}
	drawEnv(unit,posx){
		var x1 = this.staffx+this.currentNoteX+posx;
		var widthb = staffWidth - this.currentNoteX - staffLineSpacing*3;
		var yBottom =this.staffy+staffLineSpacing*4;
		var maxHeight = staffLineSpacing*4;
		var side = 2;
		ctx.fillStyle = '#ffd8d8';//'#ffbfbf'//'#ffa3a3';
		ctx.beginPath();
		ctx.moveTo(x1, yBottom);
		var contVal = 0;
		for(var i =0; i< unit.env.length; i++){
			var x2 = x1+unit.envt[i]*widthb/5;
			var yTop = yBottom-unit.env[i]*maxHeight;
			if(x2 > staffWidth+this.staffx-staffLineSpacing*3){
				if(x1+unit.envt[i-1]*widthb/5 < staffWidth+this.staffx-staffLineSpacing*3){
					var newy = calcPointFromX(staffWidth+this.staffx-staffLineSpacing*3, x1+unit.envt[i-1]*widthb/5, yBottom-unit.env[i-1]*maxHeight, x2, yTop);
					yTop = newy;
					x2 = staffWidth+this.staffx-staffLineSpacing*3;
				}else{
					yTop = yBottom;
					x2 = staffWidth+this.staffx-staffLineSpacing*3;
				}
			}
			if(x2 < this.staffx+this.currentNoteX){
				var a = i + 1;
				if(unit.envt[i+1] === undefined){
					unit.envt.length-1;
				}
				if(x1+unit.envt[a]*widthb/5 > this.currentNoteX+this.staffx){
					var newy = calcPointFromX(this.currentNoteX+this.staffx, x1+unit.envt[i+1]*widthb/5, yBottom-unit.env[i+1]*maxHeight, x2, yTop);
					yTop = newy;
					x2 = this.currentNoteX+this.staffx;
					if(i == 0){
						ctx.moveTo(x2, yBottom);
					}
					contVal = Math.round(127*(this.staffy+staffLineSpacing*5-newy)/(staffLineSpacing*5));
				}else{
					yTop = yBottom;
					x2 = this.currentNoteX+this.staffx;
				}
			}
			ctx.lineTo(x2,yTop);
			if(i == unit.env.length-1){
				ctx.lineTo(x2,yBottom);
			}
		}
		ctx.closePath();
		ctx.fill();
	}
	drawEnvLines(){
		//var line1x = this.staffx + this.currentNoteX;
		var line2x = this.staffx+staffWidth-staffLineSpacing*3;
		var linesy1 = this.staffy+staffLineSpacing*4;
		var linesy2 = this.staffy;
		var maxHeight = staffLineSpacing*4;
		ctx.strokeStyle='red';
		ctx.beginPath();
		ctx.moveTo(line2x, linesy1);
		ctx.lineTo(line2x, linesy2);
		ctx.stroke();
		ctx.strokeStyle='#ffcece';
		ctx.beginPath();
		ctx.moveTo(this.staffx+this.currentNoteX, linesy1);
		ctx.lineTo(this.staffx+this.currentNoteX, linesy2);
		ctx.stroke();
	}
	drawRest(xPosi=300){
		var xPos = xPosi+this.staffx;
		ctx.fillRect(xPos, this.staffy+this.staffLineSpacing, this.staffLineSpacing*1.5, this.staffLineSpacing/2);
	}
	setNotes(diff = 0){
		this.nextNotes = workerReturn[1][this.idNum];
		this.nextNoteTimes = workerReturn[2][this.idNum];
		for(var i = 0; i < this.nextNoteTimes.length; i++){
			this.nextNoteTimes[i] = this.nextNoteTimes[i]-diff;
		}
		this.currentEnvs = [];
		this.currentNote = workerReturn[0][this.idNum];
		this.currentEnvs = workerReturn[3][this.idNum];
		this.currentEnvTs = workerReturn[4][this.idNum];
		for(var i = 0; i < this.currentEnvTs.length; i++){
			this.currentEnvTs[i] = this.currentEnvTs[i]-diff;
		}
		if(midiTF){
			this.writeMIDI();
		}
	}
	checkClefs(){
		if(this.clef == "q" && this.altClef){
			if(this.sequence[CompClock+5] > 86){
				this.octva = true;
				this.changeClefText = ""
			}
			if(this.sequence[CompClock+5] < 86){
				this.octva = false;
				this.changeClefText = ""
			}
			if(this.sequence[CompClock+5] < 55){
				this.clef = "l";
				this.changeClefText = ""
			}
			if(this.sequence[CompClock+7] < 55){
				this.changeClefText = "Clef Change in 2";
				this.changeClefY = staffLineSpacing*2;
			}
			if(this.sequence[CompClock+7] > 86 && !this.octva){
				this.changeClefText = "to 8va in 2";
				this.changeClefY = -staffLineSpacing*6;
			}
			if(this.sequence[CompClock+7] < 86 && this.octva){
				this.changeClefText = "cancel 8va in 2";
				this.changeClefY = -staffLineSpacing*6;
			}
		}
		if(this.clef == "l" && this.altClef){
			if(this.sequence[CompClock+5] > 64){
				this.changeClefText = "";
				this.clef = "q";
			}
			if(this.sequence[CompClock+5] < 24){
				this.changeClefText = "";
				this.octvb = true;
			}
			if(this.sequence[CompClock+5] > 24){
				this.changeClefText = "";
				this.octvb = false;
			}
			if(this.sequence[CompClock+7] > 64){
				this.changeClefText = "Clef Change in 2";
				this.changeClefY = -staffLineSpacing*6;
			}
			if(this.sequence[CompClock+7] < 24 && !this.octvb){
				this.changeClefText = "to 8vb in 2";
				this.changeClefY = staffLineSpacing*2;
			}
			if(this.sequence[CompClock+7] > 24 && this.octvb){
				this.changeClefText = "cancel 8vb in 2";
				this.changeClefY = staffLineSpacing*2;
			}
		}
	}
	findDurs(unit){
		var breaks =[0];
		// rets returns a multidimensional array that contains the time and duration of each note
		var rets = [];
		for(var s = 1; s < unit.duration; s++){
			if(this.sequence[CompClock+s+Math.floor(unit.time)] != this.sequence[CompClock+s-1+Math.floor(unit.time)]){
				breaks.push(s);
			}
		}
		breaks.push(unit.duration);
		for(var b =1; b<breaks.length; b++){
			rets.push([
				breaks[b-1]+unit.time, 
				breaks[b]-breaks[b-1],
				this.sequence[CompClock+Math.floor(unit.time)+breaks[b-1]]
			]);
		}
		return rets;
	}
	writeMIDI(){
		if((Math.round(this.currentEnvTs[1]) == 0 || Math.round(this.currentEnvTs[0]) == 0) && play == true){
			var xi;
			if(Math.round(this.currentEnvTs[1]) == 0){
				xi = 1;
			}else{
				xi= 0;
			}
			for(var u =0; u < this.rhythms[this.currentEnvs[xi][0]].units.length; u++){
				var unit = this.rhythms[this.currentEnvs[xi][0]].units[u];
				if(unit.time+CompClock < this.rhythms[this.currentEnvs[xi][0]].interval[1]){
					midiOut.sendControlChange(7,
						Math.round(unit.env[0]*127), 
						this.idNum+1,
						{
							time: WebMidi.time+unit.time*1000
						}
					);
					if(unit.duration < 1){
						console.log(this.name, "Playing:", this.sequence[CompClock+Math.floor(unit.time)], "for", unit.duration, 'seconds at', unit.time, CompClock+unit.time);
						if(this.sequence[CompClock+Math.floor(unit.time)] != "r"){
							midiOut.playNote(this.sequence[CompClock+Math.floor(unit.time)], this.idNum+1, {
								duration:unit.duration*1000-50,
								time: WebMidi.time+unit.time*1000}
							);
						}
					} else {
						var td = this.findDurs(unit);
						for(var t = 0; t<td.length; t++){
							console.log(this.name, "Playing:", td[t][2], "for", td[t][1], 'seconds at', td[t][0], CompClock+td[t][0]);
							if(typeof(td[t][2]) == "number"){
								midiOut.playNote(td[t][2], this.idNum+1, {
									duration:td[t][1]*1000-50,
									time: WebMidi.time+td[t][0]*1000}
								);
							}
						}
					}
					createMIDIramp(unit, this.idNum, this.name);
				}
			}
		}
	}
}
function createMIDIramp(unit, idNum, name){
	for(var e = 1; e < unit.envt.length; e++){
		if(unit.envt[e] != unit.envt[e-1] && unit.env[e] != unit.env[e-1]){
			for(var i = 0; i < 32; i++){
				var x = Math.round(calcPointFromX(
						(i/32)*(unit.envt[e]-unit.envt[e-1])+unit.envt[e-1], 
						unit.envt[e-1],
						unit.env[e-1], 
						unit.envt[e],unit.env[e])*127);
				midiOut.sendControlChange(7,
					x, 
					idNum+1,
					{
						time: WebMidi.time+(unit.time+(i/32)*(unit.envt[e]-unit.envt[e-1])+unit.envt[e-1])*1000
					}
				);
			}
		}
	}
}
// Loads the JSON code generated by the server and creates new Part objects from it.
function loadDoc(){
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {
			var localParts = JSON.parse(xhttp.responseText);
			var enc = window.location.href.split("?parts=");
			if(enc[1] !== undefined){
				var pToLoad = enc[1].split("_");
				for(var i = 0; i < pToLoad.length; i++){
					pToLoad[i] = parseInt(pToLoad[i]);
				}
				if(pToLoad.length <= 5){
					numperline = 1;
				}
				if(pToLoad.length > 5 && pToLoad.length < 10){
					numperline = 2;
				}
				for(var i = 0; i < pToLoad.length; i++){
					Parts.push(Object.assign(new Part(), localParts[pToLoad[i]]));
				}
			}else{
				for(var i =0; i < localParts.length; i++){
					Parts.push(Object.assign(new Part(), localParts[i]));
				}
			}
			console.log(Parts);
			main();
		}
	};
	xhttp.open("GET", "Parts.json", true);
	xhttp.send();
}
function main(){
	setPartPositions();
	CompClock = 0;
	for(i in Parts){
		Parts[i].nextNotes = [];
		Parts[i].nextNoteTimes = [];
	}
	wWorker.postMessage(Parts);
	createTimeSync();
	createSocketIO();
}
// Sets up SocketIO. This is how the client communicates with the server
function createSocketIO(){
	socket = io();
	socket.on('message', function(msg){
		var msgspl = msg.split(",");
		if(msgspl[0] == 'strtstp'){
			console.log(msgspl[1]);
			if(msgspl[1] != "stop"){
				var timeInt = parseInt(msgspl[1]);
				play = true;
				startPiece(timeInt+5000);
			}else{
				play = false;
			}
		}else{
			CompClock = parseInt(msgspl[1]);
			setT = true;
			wWorker.postMessage([CompClock, true]);
		}
	});
}
function createTimeSync(){
	// This code sets up the timesync server, which is used to sync the playback between the various clients and the server
	ts = timesync.create({
		server: '/timesync',
		interval: 20000
	});
	ts.on('change', setOffset);
}
function setOffset(){
	var d = new Date();
	var a = d.getTime();
	tsSet = false;
	var oldOffset = timeOffset;
	timeOffset = d-ts.now()-oldOffset;
}
// Does the actual drawing of the page
function doFrame(time){
	ctx.fillStyle = "white";
	ctx.fillRect(0,0,scrwidth,scrheight);
	// Draws the time at the top of the screen
	drawPieceProgress();
	if(time!== undefined){
		// Sets prevFrame to be the time if prevFrame has not been set yet
		if(prevFrame === undefined){
			prevFrame = time;
		}
		// difference in time
		var changems = time+ - prevFrame;
		if(!tsSet){
			changems-=timeOffset;
			tsSet = true;
			console.log("offset:", timeOffset);
		}
		var change = false;
		var diff = 0;
		msCount+= changems;
		var nextNoteInc = changems/1000;
		if(msCount > 1000){
			var diff = (msCount - 1000)/1000;
			msCount = 0;
			change = true;
		}
		for(var p = 0; p < Parts.length; p++){
			if(change && CompClock < totalTime-1){
				Parts[p].setNotes(diff);
				Parts[p].checkClefs();
			}else{
				for(var i = 0; i < Parts[p].nextNotes.length; i++){
					Parts[p].nextNoteTimes[i]-=nextNoteInc;
				}
				for(var i = 0; i < Parts[p].currentEnvTs.length; i++){
					if(Parts[p].currentEnvTs[i] <=5){
						Parts[p].currentEnvTs[i]-=nextNoteInc;
					}else{
						break;
					}
				}
			}
			// Draw Part
			if(Parts[p].currentNote != "r" || Parts[p].nextNotes.length > 0){
				Parts[p].drawPart();
			}
		}
		if(change && CompClock < totalTime+1){
			CompClock++;
			wWorker.postMessage([CompClock+1, false]);
		}
		prevFrame = time;
		if(play == true && CompClock < totalTime-1){
			window.requestAnimationFrame(doFrame);
		}
	}else{
		for(var p = 0; p < Parts.length; p++){
			// Draw Part
			Parts[p].drawPart();
		}
	}
}
function setNotes(diff){
	try{
		for(var p =0; p < Parts.length; p++){
			Parts[p].setNotes(diff);
		}
	}catch{
		
	}
}
// Draws the progress of the piece
function drawPieceProgress(){
	for(var i in Parts[0].goalNotes){
		ctx.fillStyle = 'black';
		ctx.fillRect(Parts[0].goalNotes[i].time/totalTime*scrwidth, 0, 2, scrheight/45);
	}
	ctx.fillStyle='red';
	ctx.fillRect(0, 0, scrwidth*CompClock/totalTime, scrheight/150);
	ctx.font = partNameFont;
	ctx.fillText(CompClock, scrwidth*CompClock/totalTime, scrheight/40);
}

// The following 2 functions start the piece and draw the countdown
function startPiece(time){
	var timeDiff = time - ts.now();
	var timex = ~~(timeDiff/1000);
	var delay = timeDiff%1000;
	var setInt;
	setTimeout(drawCountDown, delay, timex);
}
function drawCountDown(num){
	if(num != 0){
		ctx.font = "100px Arial";
		ctx.fillStyle = 'white';
		var dim = ctx.measureText(num);
		ctx.fillRect(scrwidth/2-dim.width/2, scrheight/2-100, dim.width*4, 100);
		ctx.fillStyle='black';
		ctx.fillText(num, scrwidth/2, scrheight/2);
		setTimeout(drawCountDown, 1000, num-1);
	}else{
		wWorker.postMessage([CompClock+1, false]);
		window.requestAnimationFrame(doFrame);
		if(midiTF){
			for(var p = 0; p < Parts.length; p++){
				Parts[p].writeMIDI();
			}
		}
	}
}