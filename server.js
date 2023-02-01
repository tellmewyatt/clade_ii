var express = require('express');
var app = express();
var http = require('http').createServer(app);
var fs = require("fs");
var io = require('socket.io')(http);
var timesyncServer = require('timesync/server');
var xml2js = require('xml2js');
var MidiWriter = require('midi-writer-js');
var totalTime = 1192;
var CompClock = 0;
var Parts = [];
var scale = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B",];
var diatonicscale = ["C","D","E","F","G","A","B",];
var Notes = [];
var partXML;
var scaleFactor = 98/140;
// staff number of lines and space between lines
var stafflines = 5;
// top staff topline position
var framela = 0;
var currentTime = 0;
//					0	14	28	42	56	70	84	98	112	126	140	154
var diffInterval = [4,	5,	6,	3,	4,	2,	9,	4,	1,	4,	4,	4];
class Part{
	constructor(pname, srange, trange, cnote, ncp, clef, transposition=0, num, altClef = false){
		this.name = pname;
		this.range = trange - srange;
		this.rangeBottom = srange;
		this.rangeTop = trange;
		this.startingNote = cnote;
		this.notechangeprob = ncp;
		this.notechangerange = 4;
		this.noteprobs=[];
		this.notechanges =[];
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
		this.staffWidth = 600;
		this.transposition = transposition;
		var rhythm = new rhythmStruct();
		this.rhythms = [];
		this.rhythmsa = [rhythm]
		this.currentEnvs = [];
		this.currentEnvTs = [];
		this.idNum = num;
		this.cStruct;
		this.altClef = altClef;
		if(this.startingNote != "r"){
			this.currentNote = Notes[this.startingNote];
		}else{
			this.currentNote = this.startingNote;
		}
		//probabilities for each note
		for (var x =0; x< this.notechangerange*2; x++){
			var a = this.notechangerange;
			this.noteprobs.push(1/(a*2));
		}
		//set the array for note changes
		for(var i =0; i< this.notechangerange; i++){
			var a = this.notechangerange-i;
			this.notechanges.push(0-(a));
		}
		for(var i =0; i<this.notechangerange; i++){
			this.notechanges.push(i+1);
		}
	}
	setGoalIntervals(){
		var goals = this.goalNotes;
		for(var goal in goals){
			if(goal>0){
				var goalEnd = goals[goal-1].time+goals[goal-1].hold;
				this.goalNotes[goal].interval = goals[goal].time-goalEnd;
				
			}else{
				this.goalNotes[0].interval = goals[0].time;
				this.startTotal = goals[0].time;
			}
			this.goalNotes[goal].changeRate = this.goalNotes[goal].interval/this.goalNotes[goal].maxVal;
			for(var i =1; i<this.goalNotes[goal].maxVal; i++){
				this.goalNotes[goal].changes.push(Math.round(this.goalNotes[goal].changeRate*i));
			}
		}
	}
	generatePitch(prevNote, sRange){
		var cNote = prevNote;
		var newNote;
		var probabilities = this.noteprobs;
		var selectRangeBottom = cNote-sRange-this.rangeBottom;
		if(selectRangeBottom < 0){ selectRangeBottom = 0;}
		var selectRangeTop = cNote+sRange-this.rangeBottom;
		if(selectRangeTop > probabilities.length){ selectRangeTop = probabilities.length;}
		var totalNum = 0;
		for(var i = selectRangeBottom; i<selectRangeTop; i++){
			totalNum += probabilities[i];
		}
		var tryVal = totalNum*Math.random();
		totalNum = 0;
		for(var i = selectRangeBottom; i<=selectRangeTop; i++){
			totalNum += probabilities[i];
			if(tryVal <= totalNum){
				newNote = i+this.rangeBottom;
				break;
			}
		}
		this.currentNote = newNote;
		totalNum =0;
		return newNote;
	}
	setNoteProbabilities(goali){
		var goal = this.goalNotes[goali];
		this.noteprobs = [];
		var subtract = 0;
		if(this.goalNotes[goali].note != "r"){
			for(var i = goal.note-this.rangeBottom; i<=this.range; i++){
				if(goal.currentMaxProb-subtract>=0){
					this.noteprobs[i] = goal.currentMaxProb-subtract;
				}else{
					this.noteprobs[i]=0
				}
				subtract++;
			}
			subtract = 0;
			for(var i = goal.note-this.rangeBottom; i>=0; i--){
				if(goal.currentMaxProb-subtract>=0){
					this.noteprobs[i] = goal.currentMaxProb-subtract;
				}else{
					this.noteprobs[i]=0
				}
				subtract++;
			}
		}
		else{
			for(var i = 0; i<=this.range; i++){
				this.noteprobs[i]=1;
			}
		}
	}
}
// --------------------------------------------------------- GENERATE PITCHES -----------------------------------------------------
function generateSequence(){
	function doesNoteChange(prob, mval, g, pNote,inter){
		var rand = Math.random();
		if(rand < prob ||
			pNote < g.note-mval-inter+1 ||
			pNote > g.note+mval+inter-1){
			return true;
		}else{
			return false;
		}
	}
	function generatePitch(p, cnote, gnote, mval, interval){
		function findNote(mval, limits, total){
			// random number to determine the pitch
			var rand = total*Math.random();
			var counter = limits[0];
			var valCount = limits[0];
			var retVal;
			var total2=0;
			while(counter <= limits[1]){
				if(counter < mval){
					valCount++;
				}
				if(counter > mval){
					valCount--;
				}
				if(rand > total2 && rand <= total2+valCount){
					break;
				}
				total2+= valCount;
				counter++;
			}
			return counter-mval;
		}
		function setLimits(mval, cpos, interval){
			var lLimit = mval+cpos-interval;
			var uLimit = mval+cpos+interval;
			if(lLimit < 0){
				lLimit = 0;
			}
			if(uLimit > 2*mval){
				uLimit = 2*mval;
			}
			var retArr = [lLimit, uLimit];
			return retArr;
		}
		function sumTotal(mval, limits){
			var total = 0;
			var counter = limits[0];
			var valCount = limits[0];
			while(counter <= limits[1]){
				if(counter < mval){
					valCount++;
				}
				if(counter > mval){
					valCount--;
				}
				total+= valCount;
				counter++;
			}
			return total;
		}
		// calculate the position of the current note within the curve:
		var cpos = cnote-gnote;
		// determine the upper and lower limits as well as the total
		var limits = setLimits(mval, cpos, interval);
		var total = sumTotal(mval, limits);
		// returns relative position of the selected value, in reference to the goal note, 0 being the same note
		var relPos = findNote(mval,limits, total);
		// add the relative position to the goal note, check if this is in the range of the part. If not, recursive function to return a value in the range of the instrument
		var returnNote = gnote+relPos;
		if(returnNote >= p.rangeBottom && returnNote <= p.rangeTop){
			return returnNote;
		}else{
			returnNote = generatePitch(p, cnote, gnote, mval, interval);
			return returnNote;
		}
	}
	function firstPass(){
		function doesNoteChange2(prob){
			var rand = Math.random();
			if(rand < prob){
				return true;
			}else{
				return false;
			}
		}
		function eachGoal(g, p, inter, probChange = [0.05, 0.15]){
			var seq = [];
			var rTime = null;
			// Probability that the part will change notes at any given time, start, and end
			var currentProbChange = probChange[0];
			// IF previous goal is note and next goal is note
			if(g.prevNote != "r" && g.note != "r"){
				var pNote = g.prevNote;
				var mval = 30;
				var cmvalcount = 1;
				for(var i =0; i < g.interval; i++){
					currentProbChange+=(probChange[1]-probChange[0])/g.interval;
					if(i==g.changes[cmvalcount]){
						mval--;
						cmvalcount++;
					}
					var newPitch = pNote;
					if(doesNoteChange(currentProbChange, mval, g, pNote, inter)){
						newPitch = generatePitch(p, pNote, g.note, mval, inter);
					}
					seq.push(newPitch);
					pNote = newPitch;
				}
			}
			if(g.prevNote == "r" && g.note == "r"){
				for(var i =0; i < g.interval; i++){
					seq.push("r");
				}
			}
			if(g.prevNote == "r" && g.note != "r"){
				for(var i =0; i < g.interval; i++){
					seq.push("r");
				}
			}
			if(g.prevNote != "r" && g.note == "r"){
				rTime = Math.round(Math.random()*g.interval);
				var prevNote = g.prevNote;
				currentProbChange+=(probChange[1]-probChange[0])/g.interval;
				for(var i =0; i < rTime; i++){
					var newNote = prevNote;
					if(doesNoteChange2(currentProbChange)){
						newNote = generateRandomPitch(p, prevNote, inter);
					}
					seq.push(newNote);
					prevNote = newNote;
				}
				for(var i =rTime; i < g.interval; i++){
					seq.push("r");
				}
			}
			for(var h = 0; h < g.hold; h++){
				seq.push(g.note);
			}
			return [seq, rTime];
		}
		function generateRandomPitch(p,cnote, interval){
			var total = interval*2;
			var newNote = Math.round(Math.random()*total)-interval;
			var retNote = newNote+cnote;
			if(retNote < p.rangeBottom || retNote > p.rangeTop){
				retNote = generateRandomPitch(p, cnote, interval);
			}
			return retNote;
		}
		for(var p = 0; p<Parts.length; p++){
			console.log(Parts[p].name);
			for(var i=0; i < Parts[p].goalNotes[0].hold; i++){
				Parts[p].sequence.push(Parts[p].goalNotes[0].note);
			}
			for(var g = 1; g < Parts[p].goalNotes.length; g++){
				var seq = eachGoal(Parts[p].goalNotes[g],Parts[p], diffInterval[g-1]);
				for(var i = 0; i <seq[0].length; i++){
					Parts[p].sequence.push(seq[0][i]);
				}
				if(seq[1] != null){
					Parts[p].goalNotes[g].restTime = seq[1]+Parts[p].goalNotes[g].time-Parts[p].goalNotes[g].interval; 
					console.log("RESTTIME:", Parts[p].goalNotes[g].restTime);
				}
			}
			console.log(Parts[p].sequence.length);
		}
	}
	function secondPass(){
		function setMVal(entrance, interval){
			var ret = 30;
			if(interval-entrance < 30){
				ret = Math.floor((interval-entrance)/2)
			}
			return ret;
		}
		function setNotes(p, g, mval, entrance, inter, probChange = [0.05, 0.15]){
			var currentProbChange = probChange[0];
			var seq=[];
			var changerate = (g.interval-entrance)/mval;
			var changes =[];
			var mval2 = mval;
			var probChangeRate = (probChange[1]-probChange[0])/(g.interval-entrance);
			for(var i = 1; i < mval; i++){
				changes.push(Math.round(changerate*i));
			}
			for(var s = 0; s < entrance; s++){
				seq.push("r");
			}
			var prevNote = findStartingNote(p,entrance+g.time-g.interval, g, mval);
			seq.push(prevNote);
			var changeCount = 1;
			for(var s = entrance+1; s < g.interval; s++){
				currentProbChange+= probChangeRate;
				if(s == entrance+changes[changeCount]){
					mval2--;
					changeCount++;
				}
				if(doesNoteChange(currentProbChange, mval2, g, prevNote,inter)){
					var newNote = generatePitch(p, prevNote, g.note, mval2, inter);
					seq.push(newNote);
					prevNote = newNote;
				}else{
					seq.push(prevNote);	
				}
			}
			return seq;
		}
		for(var p = 0; p<Parts.length; p++){
			console.log("Second Pass: ", Parts[p].name);
			for(var g =0; g< Parts[p].goalNotes.length; g++){
				if(Parts[p].goalNotes[g].prevNote == "r" && Parts[p].goalNotes[g].note != "r"){
					var entrance = Math.round(Math.random()*Parts[p].goalNotes[g].interval);
					Parts[p].goalNotes[g].entryTime = entrance+Parts[p].goalNotes[g].time-Parts[p].goalNotes[g].interval;
					var mval = setMVal(entrance, Parts[p].goalNotes[g].interval);
					seq = setNotes(Parts[p], Parts[p].goalNotes[g], mval, entrance,diffInterval[g-1]);
					for(var s = 0; s<seq.length; s++){
						Parts[p].sequence[Parts[p].goalNotes[g].time-Parts[g].goalNotes[g].interval+s] = seq[s];
					}
				}
			}
		}
	}
	function exportParts(){
		var partsJSON = JSON.stringify(Parts);
		/*fs.writeFile('Parts.json', partsJSON, function (err){
			if(err) throw err;
		});*/
		//console.log("Finished writing Parts.json")
		/*
		var d = new Date();
		var fname = "/backup_parts/" + d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate() + "_" + d.getHours() + "-" + d.getMinutes() + "-" + d.getSeconds()
		fs.writeFile(__dirname+fname, partsJSON, function (err){
			if(err) throw err;
		});*/
		drawSVG();
	}
	firstPass();
	secondPass();
	//Set rhythms
	changeRhythms();
	exportParts();
}
/*function exportShorterDurations(){
	var str = "";
	for(var p = 0; p< Parts.length; p++){
		for(var r =0; r< Parts[p].rhythmsa.length; r++){
			Parts[p].rhythmsa[r].interval[0] = Math.round(Parts[p].rhythmsa[r].interval[0]*scaleFactor);
			Parts[p].rhythmsa[r].interval[1] = Math.round(Parts[p].rhythmsa[r].interval[1]*scaleFactor);
			str+="//"+Parts[p].name+"\nParts["+p+"].rhythmsa="+JSON.stringify(Parts[p].rhythmsa, null, "	");
			console.log(Parts[p].name, r, Parts[p].rhythmsa[r].interval[0], Parts[p].rhythmsa[r].interval[1]);
		}
	}
	fs.writeFile('rhythms.txt', str, function (err){
		if(err) throw err;
	});
}*/
function changeRhythms(){
	
	for(var p = 0; p< Parts.length; p++){
		// determines the start and end times
		var startTimes = [];
		var endTimes = [];
		for(var g = 0; g<Parts[p].goalNotes.length; g++) {
			if(Parts[p].goalNotes[g].entryTime != null){
				startTimes.push(Parts[p].goalNotes[g].entryTime);
			}
			if(g == 0 && Parts[p].goalNotes[g].note != 'r'){
				startTimes.push(0);
			}
			if(Parts[p].goalNotes[g].restTime != null){
				endTimes.push(Parts[p].goalNotes[g].restTime);
			}
			if(g == Parts[p].goalNotes.length-1 && Parts[p].goalNotes[g].note != 'r'){
				endTimes.push(totalTime);
			}
		}
		console.log(Parts[p].name, startTimes.length, endTimes.length);
		//adjusts the rhythms accordingly
		var rhy = 0;
		var rhys = [];
		for(var i = 0; i < startTimes.length; i++){
			var time = startTimes[i];
			while(time < endTimes[i]){
				for(var r = 0; r < Parts[p].rhythmsa.length; r++){
					if(time < Parts[p].rhythmsa[r].interval[1]){
						var struct = Parts[p].rhythmsa[r];
						if(Parts[p].rhythmsa[r].interval[1] < endTimes[i]){
							rhys.push(new rhythmStruct(struct.units, struct.totalTime, [time, struct.interval[1]]));
						}else{
							rhys.push(new rhythmStruct(struct.units, struct.totalTime, [time, endTimes[i]]));
						}
						time = Parts[p].rhythmsa[r].interval[1];
						break;
					}
				}
			}
		}
		for(var i =0; i<rhys.length; i++){
			rhys[i].setTimes();
		}
		Parts[p].rhythms = rhys;
	}
}
function drawSVG(){
	var scalefact = 5;
	var transf = 0;
	var yscale = 5;
	var txt = "<html><head></head><body style='padding:0px;'><svg width='"+scalefact*Parts[0].sequence.length+"' height='"+(yscale*127)+"'>";
	var txt2 = "";
	var key = "";
	for(var i = 0; i < 127; i++){
		var style = "style='fill:#edf8ff'";
		if(i%12-7 == 0){
			style = 'style="fill:#e1efed"'
		}
		if(i == 67){
			style = 'style="fill:#c1dad6"';
		}
		
		txt+="<rect class='gridline' x='0' y='"+(i*yscale)+"' height='1' "+style+" width='"+scalefact*Parts[0].sequence.length+"'/>";
	}
	for(var i = 0; i < Parts[0].sequence.length; i++){
		txt+="<rect class='gridline' x='"+(scalefact*i)+"' y='0' height='5' style='fill:grey' width='1'/><rect x='"+(scalefact*i)+"' y='5' height='"+(yscale*127-5)+"' style='fill:#e1efed' width='1'/>";
	}
	for(var i = 0; i < Parts[0].goalNotes.length; i++){
		txt+="<rect class='gridline' x='"+(scalefact*Parts[0].goalNotes[i].time)+"' y='0' height='10' style='fill:black' width='1'/><text x="+(scalefact*Parts[0].goalNotes[i].time)+" y='15'>"+Parts[0].goalNotes[i].time+"</text>";
	}
	for(var p =0; p<Parts.length; p++){
		if(Parts[p].name == "Cb."){transf = -12}
		var r = Math.round(Math.random()*256);
		var g = Math.round(Math.random()*256);
		var b = Math.round(Math.random()*256);
		var color = "rgb("+r+","+g+","+b+")";
		var set = false;
		key+="<div id='"+Parts[p].name+"'><svg height='10' width='10'><rect x='0' y='0' width='10' height='10' style='fill:"+color+"'/></svg> "+Parts[p].name+"</div>"
		txt2 = "<polyline style='stroke:"+color+"; stroke-width:1; fill:none;' points='"
		for(var s = 0; s< Parts[p].sequence.length; s++){
			if(Parts[p].sequence[s] === undefined){
				console.log("Found error: ", Parts[p].name, s);
			}
			if(Parts[p].sequence[s] != "r"){
				txt2+=(s*scalefact)+","+(127*yscale-(Parts[p].sequence[s]+Parts[p].transposition+transf)*yscale)+" ";
			}else{
				txt2+="'/><polyline style='stroke:"+color+"; stroke-width:1; fill:none;' points='";
			}
		}
		txt2+="'/>";
		txt+=txt2;
	}
	
	txt+= "</svg><div id='key' style='position:fixed; top:0px; right:50px'>"+key+"</div></body></html>";
	fs.writeFile('files/chart.html', txt, function (err){
	if(err) throw err;
	});
}
function findStartingNote(part, time, goal, mval){
	var noteArray = [];
	for(var i = 0; i < Parts.length; i++){
		var transnote;
		if(Parts[i].sequence[time]!= "r"){
			transnote = Parts[i].sequence[time]+Parts[i].transposition-part.transposition;
		}
		if(Parts[i].sequence[time] != "r" 
			&& transnote > part.rangeBottom
			&& transnote < part.rangeTop
			&& transnote > goal.note-mval
			&& transnote < goal.note+mval
			){
				noteArray.push(transnote);
		}
	}
	if(noteArray.length == 0){
		var vara = false;
		while(vara == false){
			var addon = Math.floor(Math.random()*(mval*2))+goal.note-mval;
			if(addon >= part.rangeBottom && addon <= part.rangeTop && addon >= goal.note-mval && addon <= goal.note+mval){
				noteArray.push(addon);
				console.log("ADDED: ", addon, "to", part.name, time);
				vara= true;
			}
		}
	}
	var returnNote = noteArray[Math.floor(Math.random()*noteArray.length)];
	return returnNote;
}
class rhythmStruct{
	constructor(rhy = [new rhyUnit(1), new rhyUnit(1.5, 1, [0,1,0], [0,1,1.5])], totalTime=3, interval = [0,4000]){
		this.units = rhy
		this.totalTime = totalTime;
		this.interval = interval;
		this.times = [];
		this.endUnits = [];
	}
	setTimes(){
		this.times = [];
		var t = this.interval[0]
		while(t < this.interval[1]){
			this.times.push(t);
			t+=this.totalTime;
		}
		this.calcEndUnits(this.times[this.times.length-1], this.interval[1]);
	}
	calcEndUnits(lastTime, totalTime){
		this.endUnits = [];
		var timeDiff = totalTime-lastTime;
		for(var i =0; i < this.units.length; i++){
			if(this.units[i].time < timeDiff){
				if(this.units[i].duration+this.units[i].time <= timeDiff){
					this.endUnits.push(this.units[i]);
				}else{
					var dur = timeDiff-this.units[i].time;
					var t = this.units[i].time;
					var newTimes = [];
					var newEnvs = this.units[i].env;
					for(var x = 0; x < this.units[i].envt.length; x++){
						if(this.units[i].envt[x] < timeDiff){
							newTimes.push(this.units[i].envt[x]);
						}else{
							newTimes.push(timeDiff);
						}
					}
					this.endUnits.push(new rhyUnit(dur, t, newEnvs, newTimes));
				}
				
			}
		}
	}
}
function randRhythmGen(ttime = Math.round(Math.random()*10+5), rnum = 5, interval=[0,1000]){
	var timeAr = [];
	var holdAr = [];
	var finAr = [];
	for(var i = 0; i< rnum; i++){
		timeAr.push(Math.random()*ttime);
	}
	timeAr = timeAr.sort(function(a,b){return a-b});
	for(var i =0; i<timeAr.length-1; i++){
		holdAr.push(Math.random()*(timeAr[i+1]- timeAr[i]))
	}
	holdAr.push(Math.random()*(ttime-timeAr[timeAr.length-1]));
	for(var i = 0; i<timeAr.length; i++){
		finAr.push(new rhyUnit(holdAr[i], timeAr[i], [1,1,0], [0, holdAr[i]*Math.random(), holdAr[i]]));
	}
	var retRhy = new rhythmStruct(finAr, ttime,  interval);
	return retRhy;
}
class rhyUnit{
	constructor(duration = 1, delay = 0, env = [1,1], envt=[0, duration]){
		this.duration = duration;
		this.time = delay;
		this.env = env;
		this.envt = envt;
	}
}
class goalNote{
	// goal note, the time at which it occurs, and how long to hold it for before moving on to the next goalNote
	constructor(prevnote, note, time, hold){
		this.prevNote = prevnote;
		this.note = note;
		this.time = time;
		this.hold = hold;
		this.interval;
		this.endTime;
		this.noteInterval = Math.abs(note-prevnote);
		this.maxVal = 30;
		this.changeRate;
		this.changes = [];
		this.counter=0;
		this.timer=0;
		this.currentMaxProb = this.maxVal;
		this.restTime = null;
		this.entryTime = null;
		this.replaceIt = false;
		this.noteprobchange = 1/300;
		this.notechangerate = 0.02;
	}
	incrementSteps(){
		this.counter++;
		this.currentMaxProb-=1;
		this.notechangerate += this.noteprobchange;
	}
	incrementTimer(){
		this.timer++;
		if(this.timer == this.changes[this.counter]){
			this.incrementSteps();
		}
	}
	setChanges(){
		this.currentMaxProb = this.maxVal;
		this.changes = [];
		this.timer =0;
		this.counter = 0;
		if((this.time-this.entryTime) < this.maxVal){
			this.currentMaxProb = Math.round((this.time-this.entryTime)/2);
		}
		this.changeRate = (this.time-this.entryTime)/this.currentMaxProb;
		for(var i =1; i<this.maxVal; i++){
			this.changes.push(Math.round(this.changeRate*i));
		}
	}
}
// Part Name, Bottom of Range, Top of Range, Start Note, Probability of Note Change, Clef, (Transposition), Pan, loop
// For clefs: q = treble, l = bass, n = alto
Parts.push(new Part("Fl.", 60, 96, "r", 0.05, "q", 0, 0));
Parts.push(new Part("Ob.", 58, 103, "r", 0.05, "q", 0, 1));
Parts.push(new Part("A. Sax", 60, 88, "r", 0.05, "q", -9, 2));
Parts.push(new Part("Bsn.", 46, 67, "r", 0.05, "l", 0, 3, true));
Parts.push(new Part("B. Cl.", 52, 84, "r", 0.05, "q", -14, 4));
Parts.push(new Part("Hn.", 42, 79, "r", 0.05, "q", -7, 5, true));
Parts.push(new Part("Tpt.", 54, 82, "r", 0.05, "q", -2, 6));
Parts.push(new Part("Tbn.", 40, 66, "r", 0.05, "l", 0, 7, true));
Parts.push(new Part("Pno.", 60, 127, "r", 0.05, "q", 0, 8, true));
Parts.push(new Part("Pno.", 12, 60, "r", 0.05, "l", 0, 9, true));
Parts.push(new Part("Vln. I", 55, 100, 72, 0.05, "q", 0, 10));
Parts.push(new Part("Vln. II", 55, 100, 72, 0.05, "q", 0, 11));
Parts.push(new Part("Va.", 48, 93, 72, 0.05, "n", 0, 12));
Parts.push(new Part("Vc.", 36, 79, 72, 0.05, "l", 0, 13, true));
Parts.push(new Part("Cb.", 40, 70, 72, 0.05, "l", 0, 14, true));
// Part Rhythms
// rhythmStruct([units], total time, [interval]);
// RhyUnit(length, delay, env, envTimes)
// Flute
Parts[0].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 1, 0], [0, 2, 4, 5.4]) 
	],6, [0, 101]),
	new rhythmStruct([
		new rhyUnit(4.5, 0, [0, 1, 1, 0], [0, 2, 3, 4.5]), 
	],5, [101, 121]),
	new rhythmStruct([
		new rhyUnit(2.5, 0, [0, 1, 1, 0], [0, 0.5, 1, 2.5]), 
		new rhyUnit(1.5, 2.5, [0, 1, 1, 0], [0, 0.5, 1, 1.5]), 
	],5, [121, 136]),
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(2, 1, [1, 1, 0], [0, 0.5, 2])
	],3, [136, 172]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(1, 0.5, [1, 1, 0], [0, 0.5, 1])],
			20, 8, 1.5
		), 22, [172, 194]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			20, 25, 0.5
		), 20, [194, 214]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(1, 0.5, [1, 1, 0], [0, 0.5, 1])],
			20, 12, 1.5
		), 22, [214, 478]
	),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.3,.3]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.3]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.3,.3]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.3]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.5, Math.round(Math.random()*25)/5+5, [0,1,0], [0,.5,.5]),
	], 10, [478, 528]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.3, .125, [1, 1, 0], [0, 0.3, 0.3]), 
			new rhyUnit(0.1, .45, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			22, 17, 0.6
		), 22, [528, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,734]),
	new rhythmStruct([
		new rhyUnit(4, 0, [0, 1, 0], [0, 2, 4])
	], 4, [734,749]),
	new rhythmStruct([
		new rhyUnit(1.25, 0, [0, 1, 0], [0, .5, 1.25]),
		new rhyUnit(1.25, 1.25, [0, 1, 0], [0, .5, 1.25]),
		new rhyUnit(1.25, 2.5, [0, 1, 0], [0, .5, 1.25]),
		new rhyUnit(1.25, 3.75, [0, 1, 0], [0, .5, 1.25]),
	], 5, [749,804]),
	new rhythmStruct([
		new rhyUnit(2, 0, [0, 1], [0,2])
	], 4, [804,2800]),
	// FOR THE NEXT PART, CONSIDER HAVING STRINGS PLAY ACTUAL RHYTHMS TOGETHER
];
// OBOE
Parts[1].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 1, 0], [0, 2, 4, 5.4]) 
	],6, [0, 101]),
	new rhythmStruct([
		new rhyUnit(4.5, 0, [0, 1, 1, 0], [0, 2, 3, 4.5]), 
	],5, [101, 121]),
	new rhythmStruct([
		new rhyUnit(2.5, 0, [0, 1, 1, 0], [0, 0.5, 1, 2.5]), 
		new rhyUnit(1.5, 2.5, [0, 1, 1, 0], [0, 0.5, 1, 1.5]), 
	],5, [121, 136]),
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(2, 1, [1, 1, 0], [0, 0.5, 2])
	],3, [136, 173]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(1, 0.5, [1, 1, 0], [0, 0.5, 1])],
			20, 8, 1.5
		), 22, [173, 195]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			20, 25, 0.5
		), 20, [195, 215]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(1, 0.5, [1, 1, 0], [0, 0.5, 1])],
			20, 12, 1.5
		), 22, [215, 490]
	),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.3,.3]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.3]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.3,.3]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.3]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.5, Math.round(Math.random()*25)/5+5, [0,1,0], [0,.5,.5]),
	], 10, [490, 524]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1])], 
			20, 12, 0.5
		), 22, [524, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,734]),
	new rhythmStruct([
		new rhyUnit(4, 0, [0, 1, 0], [0, 2, 4])
	], 4, [734,749]),
	new rhythmStruct([
		new rhyUnit(1.25, 0, [0, 1, 0], [0, .5, 1.25]),
		new rhyUnit(1.25, 1.25, [0, 1, 0], [0, .5, 1.25]),
		new rhyUnit(1.25, 2.5, [0, 1, 0], [0, .5, 1.25]),
		new rhyUnit(1.25, 3.75, [0, 1, 0], [0, .5, 1.25]),
	], 5, [749,804]),
	new rhythmStruct([
		new rhyUnit(2, 0, [0, 1], [0,2])
	], 4, [804,2600]),
	// FOR THE NEXT PART, CONSIDER HAVING STRINGS PLAY ACTUAL RHYTHMS TOGETHER
];
function randomlyPlaceStruct(units, ttime,num, unitsL,q = 8){
	var nm = [];
	var startTimes = [0];
	for(var a =0; a <units.length; a++){
		nm.push(new rhyUnit(units[a].duration, units[a].time, units[a].env, units[a].envt));
	}
	for(var i =0; i < num-1; i++){
		var displace = Math.round(Math.random()*ttime*q)/q;
		var fits = false;
		var counter = 0;
		while(fits == false){
			fits = true;
			for(var x =0; x < startTimes.length; x++){
				if((displace >= startTimes[x] && displace < startTimes[x] + unitsL)
				|| (displace+unitsL > startTimes[x] && displace+unitsL <= startTimes[x] + unitsL)
				){
					fits = false;
				}
			}
			if(fits == false){
				displace = Math.round(Math.random()*ttime*q)/q;
			}
			counter++;
			if(counter > 1024){
				fits = false;
				break;
			}
		}
		if(fits){
			for(var a =0; a <units.length; a++){
				nm.push(new rhyUnit(units[a].duration, units[a].time+displace, units[a].env, units[a].envt));
			}
			startTimes.push(displace);
		}
	}
	return nm;
}
// Alto
Parts[2].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(4.5, 1, [1, 1, 0], [0, 0.5, 4.5]),
		// p 2
		new rhyUnit(0.1, 5.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(5.5, 6, [1, 1, 0], [0, 0.5, 4.5])
	],11, [0, 490]),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3, 0.5, [1, 1, 0], [0, 3, 3]),
	], 4,[490, 524]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.2, 0, [1, 1, 0], [0, 0.2, 0.2]), 
			new rhyUnit(0.6, .3, [1, 1, 0], [0, 0.6, 0.6]), 
			new rhyUnit(0.2, 1, [1, 1, 0], [0, 0.2, 0.2]), 
			],
			20, 8, 1.1
		), 22, [524, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,734]),
	new rhythmStruct([
		new rhyUnit(3, 0, [0, 1, 0], [0, 1.5, 3])
	], 3, [734,827]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(1, 0, [0, 1], [0, 1])], 
			20, 13, 1
		), 22, [827, 2600]
	),
];
// Bassoon
Parts[3].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(4.5, 1, [1, 1, 0], [0, 0.5, 4.5]),
		// p 2
		new rhyUnit(0.1, 5.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(5.5, 6, [1, 1, 0], [0, 0.5, 4.5])
	],11, [0, 273]),
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(4.5, 1, [1, 1, 0], [0, 0.5, 4.5]),
		// p 2
		new rhyUnit(0.1, 5.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(4.5, 6, [1, 1, 0], [0, 0.5, 3.5])
	],10, [273, 294]),
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3.5, 1, [1, 1, 0], [0, 0.5, 3.5]),
		// p 2
		new rhyUnit(0.1, 4.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 4.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 4.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 4.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3.5, 5, [1, 1, 0], [0, 0.5, 3.5])
	],8, [294, 311]),
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(2.5, 1, [1, 1, 0], [0, 0.5, 2.5]),
		// p 2
		new rhyUnit(0.1, 3.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(1.5, 4, [1, 1, 0], [0, 0.5, 1.5])
	],6, [311, 319]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			20, 15, 0.5
		), 20, [319, 490]
	),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3, 0.5, [1, 1, 0], [0, 3, 3]),
	], 4,[490, 524]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1])], 
			20, 16, 0.25
		), 22, [524, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,2800]),
];

// Bass Clarinet
Parts[4].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(4.5, 1, [1, 1, 0], [0, 0.5, 4.5]),
		// p 2
		new rhyUnit(0.1, 5.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(5.5, 6, [1, 1, 0], [0, 0.5, 4.5])
	],11, [0, 273]),
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(4.5, 1, [1, 1, 0], [0, 0.5, 4.5]),
		// p 2
		new rhyUnit(0.1, 5.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 5.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(4.5, 6, [1, 1, 0], [0, 0.5, 3.5])
	],10, [273, 293]),
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3.5, 1, [1, 1, 0], [0, 0.5, 3.5]),
		// p 2
		new rhyUnit(0.1, 4.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 4.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 4.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 4.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3.5, 5, [1, 1, 0], [0, 0.5, 3.5])
	],8, [293, 311]),
	new rhythmStruct([
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(2.5, 1, [1, 1, 0], [0, 0.5, 2.5]),
		// p 2
		new rhyUnit(0.1, 3.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(1.5, 4, [1, 1, 0], [0, 0.5, 1.5])
	],6, [311, 319]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.3, .125, [1, 1, 0], [0, 0.3, 0.3]), 
			new rhyUnit(0.1, .45, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			19, 12, 0.6
		), 20, [319, 359]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.2, 0, [1, 1, 0], [0, 0.2, 0.2]), 
			new rhyUnit(0.6, .3, [1, 1, 0], [0, 0.6, 0.6]), 
			new rhyUnit(0.2, 1, [1, 1, 0], [0, 0.2, 0.2]), 
			],
			19, 8, 1.3
		), 20, [359, 399]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.15, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.45, 0.1875, [1, 1, 0], [0, 0.45, 0.45]), 
			new rhyUnit(0.15, 0.675, [1, 1, 0], [0, 0.15, 0.15]), 
			],
			19, 12, 0.7
		), 21, [399, 420]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.2, 0, [1, 1, 0], [0, 0.2, 0.2]), 
			new rhyUnit(0.3, .225, [1, 1, 0], [0, 0.3, 0.3]), 
			new rhyUnit(0.1, .55, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			19, 13, 0.75
		), 20, [420, 490]
	),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3, 0.5, [1, 1, 0], [0, 3, 3]),
	], 4,[490, 524]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1])], 
			20, 16, 0.25
		), 22, [524, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,2800]),
];

// Horn
Parts[5].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(7, 0, [0, 1, 0.2, 0], [0, 2, 6, 7]),
		new rhyUnit(9, 7, [0, 1, 0.7, 0], [0, 2, 6, 9]),
		new rhyUnit(6, 16, [0, 1, 1, 0], [0, 2, 4, 6])
	], 23, [0,490]),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3, 0.5, [1, 1, 0], [0, 3, 3]),
	], 4,[490, 524]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1])], 
			20, 30, 0.25
		), 22, [524, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,734]),
	new rhythmStruct([
		new rhyUnit(4, 0, [0, 1, 0], [0, 2, 4])
	], 4, [734,825]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(1.5, 0, [0, 1], [0, 1.5])], 
			20, 12, 1.5
		), 22, [825, 2800]
	),
];
// Trumpet
Parts[6].rhythmsa = [
	new rhythmStruct([new rhyUnit(7, 0, [0, 1, 0.2, 0], [0, 2, 6, 7])], 9, [0, 490]),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3, 0.5, [1, 1, 0], [0, 3, 3]),
	], 4,[490, 524]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.3, .125, [1, 1, 0], [0, 0.3, 0.3]), 
			new rhyUnit(0.1, .45, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			22, 15, 0.6
		), 22, [524, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,739]),
	new rhythmStruct([
		new rhyUnit(5, 0, [0, 1, 0], [0, 2.5, 5])
	], 5, [739,813]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(1, 0, [0, 1], [0, 1])], 
			20, 15, 1
		), 22, [813, 2800]
	),
];
// Trombone
Parts[7].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(7, 0, [0, 1, 0.2, 0], [0, 2, 5, 6]),
		new rhyUnit(9, 7, [0, 1, 0.7, 0], [0, 2, 6, 8]),
		new rhyUnit(7, 16, [0, 1, 1, 0], [0, 2, 3, 4])
	], 21, [0,490]),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(3, 0.5, [1, 1, 0], [0, 3, 3]),
	], 4,[490, 524]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.3, .125, [1, 1, 0], [0, 0.3, 0.3]), 
			new rhyUnit(0.1, .45, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			22, 15, 0.6
		), 22, [524, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,2800]),
];
// Piano I
var pnoArr1 = randomlyPlaceStruct(
	[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
	new rhyUnit(0.3, .125, [1, 1, 0], [0, 0.3, 0.3]), 
	new rhyUnit(0.1, .45, [1, 1, 0], [0, 0.1, 0.1]), 
	],
	13, 19, 0.6
);
pnoArr1.push(new rhyUnit(4.5, 15.5, [1,1,0], [0, 4, 4.5]));
Parts[8].rhythmsa = [
	new rhythmStruct([
		//p 1
		new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(2, 1, [1, 1, 0], [0, 0.5, 2]),
		//p 2
		new rhyUnit(0.1, 3.5, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.625, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.75, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.875, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(1.5, 4, [1, 1, 0], [0, 0.5, 1.5]),
		//p 3
		new rhyUnit(0.1, 6, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 6.125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 6.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 6.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(2, 6.5, [1, 1, 0], [0, 0.5, 2]),
		new rhyUnit(0.1, 9, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 9.125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 9.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 9.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(1.5, 9.5, [1, 1, 0], [0, 0.5, 1.5]),
		
	], 11,[0, 272]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.5, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.625, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(1, 0.75, [1, 1, 0], [0, 0.5, 1]), 
			],
			17, 10, 1.75
		), 19, [272, 325]
	),
	new rhythmStruct(
		pnoArr1, 20, [325, 588]
	),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	randRhythmGen(20, 40, [692,2800])
];
// Piano II
function setPnoII1(){
	var ar1 = [0];
	var lengths = [];
	var retArr = [];
	for(var i = 0; i < 3; i++){
		var randNum = Math.random()*30;
		ar1.push(randNum);
	}
	ar1.sort(function(a, b) {
		return a - b;
	});
	for(var i=1; i< ar1.length; i++){
		lengths.push(ar1[i]-0.1-ar1[i-1]);
	}
	lengths.push(30-ar1[ar1.length-1]-0.1);
	for(var i = 0; i < 4; i++){
		retArr.push(new rhyUnit(lengths[i], ar1[i], [1,1], [0, lengths[i]]));
	}
	return retArr;
}
Parts[9].rhythmsa = [
	new rhythmStruct(setPnoII1(), 30, [0, 588]),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,2800]),
];
// Violin I
Parts[10].rhythmsa = [
	new rhythmStruct([new rhyUnit(9, 0, [0, 1, 0.7, 0], [0, 2, 6, 9])], 9, [0, 69]),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, 0.2, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, 0.4, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, 0.6, [1,1,0], [0,.1,.1])
	], 1, [69, 105]),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, 0.15, [1,1,0], [0,.1,.1])
	], 1, [105, 140]),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.3,.3]),
		new rhyUnit(0.3, Math.round(Math.random()*25)/5, [1,1,0], [0,.1,.3]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*25)/5+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.5, Math.round(Math.random()*25)/5+5, [0,1,0], [0,.5,.5]),
	], 10, [140, 168]),
	new rhythmStruct([
		new rhyUnit(0.1, 0, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.4, Math.round(Math.random()*40)/8, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.3, Math.round(Math.random()*40)/8, [1,1,0], [0,.3,.3]),
		new rhyUnit(0.3, Math.round(Math.random()*40)/8, [1,1,0], [0,.1,.3]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.2, Math.round(Math.random()*40)/8+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.1, Math.round(Math.random()*40)/8+5, [1,1,0], [0,.1,.1]),
		new rhyUnit(0.5, Math.round(Math.random()*40)/8+5, [0,1,0], [0,.5,.5]),
	], 10, [168, 182]),
	new rhythmStruct([
		new rhyUnit(0.2, 0, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, 0.375, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.4, 0.75, [1,1,0], [0, 0.4, 0.4]),
		new rhyUnit(0.2, 1.25, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, 1.5, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, 1.75, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, Math.round(Math.random()*32)/8+2, [1,1,0], [0,.2,.2]),
		new rhyUnit(0.2, Math.round(Math.random()*32)/8+2, [1,1,0], [0,.2,.2]),
		new rhyUnit(0.2, Math.round(Math.random()*32)/8+2, [1,1,0], [0,.2,.2]),
		new rhyUnit(0.2, Math.round(Math.random()*32)/8+2, [1,1,0], [0,.2,.2]),
		new rhyUnit(0.2, Math.round(Math.random()*32)/8+2, [1,1,0], [0,.2,.2]),
		new rhyUnit(0.2, 6, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, 6.375, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.4, 6.75, [1,1,0], [0, 0.4, 0.4]),
		new rhyUnit(0.2, 7.25, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, Math.round(Math.random()*20)/8+7.5, [1,1,0], [0,.2,.2]),
		new rhyUnit(0.2, Math.round(Math.random()*20)/8+7.5, [1,1,0], [0,.2,.2]),
		new rhyUnit(0.2, Math.round(Math.random()*20)/8+7.5, [1,1,0], [0,.2,.2]),
		new rhyUnit(0.2, Math.round(Math.random()*20)/8+7.5, [1,1,0], [0,.2,.2]),
		
	], 10, [182, 196]),
	new rhythmStruct([
		new rhyUnit(0.2, 0, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, 0.375, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.4, 0.75, [1,1,0], [0, 0.4, 0.4]),
		new rhyUnit(0.2, 1.25, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, 1.5, [1,1,0], [0, 0.2, 0.2]),
		new rhyUnit(0.2, 1.75, [1,1,0], [0, 0.2, 0.2]),
	], 2, [196, 294]),
	new rhythmStruct([
		new rhyUnit(7, 0, [0, 1, 0.2, 0], [0, 2, 6, 7]),
		new rhyUnit(9, 7, [0, 1, 0.7, 0], [0, 2, 6, 9]),
		new rhyUnit(6, 16, [0, 1, 1, 0], [0, 2, 4, 6])
	], 22, [294,490]),
	new rhythmStruct([
		new rhyUnit(5, 0 , [1,1], [0,5])
	], 5,[490, 588]),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,743]),
	new rhythmStruct([
		new rhyUnit(1.2, 0, [0, 1, 0], [0, 0.6, 1.2]),
		new rhyUnit(1.2, 1.2, [0, 1, 0], [0, 0.6, 1.2]),
		new rhyUnit(1.2, 2.4, [0, 1, 0], [0, 0.6, 1.2]),
		new rhyUnit(1.2, 3.6, [0, 1, 0], [0, 0.6, 1.2]),
		new rhyUnit(1.2, 4.8, [0, 1, 0], [0, 0.6, 1.2]),
	], 6, [743,809]),
	new rhythmStruct([
		new rhyUnit(1, 0, [0, 1, 0], [0, 0.5, 1]),
	], 1, [809,817]),
	new rhythmStruct([
		new rhyUnit(0.8, 0, [0, 1, 0], [0, 0.4, 0.8]),
		new rhyUnit(0.8, 0.8, [0, 1, 0], [0, 0.4, 0.8]),
		new rhyUnit(0.8, 1.6, [0, 1, 0], [0, 0.4, 0.8]),
		new rhyUnit(0.8, 2.4, [0, 1, 0], [0, 0.4, 0.8]),
		new rhyUnit(0.8, 3.2, [0, 1, 0], [0, 0.4, 0.8]),
	], 4, [817,825]),
	new rhythmStruct([
		new rhyUnit(0.6, 0, [0, 1, 0], [0, 0.3, 0.6]),
		new rhyUnit(0.6, .6, [0, 1, 0], [0, 0.3, 0.6]),
		new rhyUnit(0.6, 1.2, [0, 1, 0], [0, 0.3, 0.6]),
		new rhyUnit(0.6, 1.8, [0, 1, 0], [0, 0.3, 0.6]),
		new rhyUnit(0.6, 2.4, [0, 1, 0], [0, 0.3, 0.6]),
	], 3, [825,831]),
	new rhythmStruct([
		new rhyUnit(0.4, 0, [0, 1, 0], [0, 0.2, 0.4]),
		new rhyUnit(0.4, 0.4, [0, 1, 0], [0, 0.2, 0.4]),
		new rhyUnit(0.4, 0.8, [0, 1, 0], [0, 0.2, 0.4]),
		new rhyUnit(0.4, 1.2, [0, 1, 0], [0, 0.2, 0.4]),
		new rhyUnit(0.4, 1.6, [0, 1, 0], [0, 0.2, 0.4]),
	], 2, [831,835]),
	new rhythmStruct([
		new rhyUnit(0.2, 0, [0, 1, 0], [0, 0.1, 0.2]),
		new rhyUnit(0.2, 0.2, [0, 1, 0], [0, 0.1, 0.2]),
		new rhyUnit(0.2, 0.4, [0, 1, 0], [0, 0.1, 0.2]),
		new rhyUnit(0.2, 0.6, [0, 1, 0], [0, 0.1, 0.2]),
		new rhyUnit(0.2, 0.8, [0, 1, 0], [0, 0.1, 0.2]),
	], 1, [835,2800]),
];

// Violin II
Parts[11].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(5, 0, [0, 1, 0.7, 0], [0, 2, 3, 5])
	], 6, [0, 252]),
	new rhythmStruct([
		//p 1
		new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.2, 0.5, [1, 1, 0], [0, 0.2, 0.2]),
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 1, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(1.75, 1.25, [1, 0], [0, 1.75]),
		//p 2
		new rhyUnit(0.1, 3, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 3.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.2, 3.5, [1, 1, 0], [0, 0.2, 0.2]),
		new rhyUnit(0.1, 3.75, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 3.875, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 4, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(2.75, 4.25, [1, 0], [0, 2.75]),
	], 7,[252, 306]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			20, 20, 0.7
		), 20, [306, 326]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.2, .15, [1, 1, 0], [0, 0.2, 0.2]), 
			new rhyUnit(0.1, 0.4, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.2, 0.55, [1, 1, 0], [0, 0.2, 0.2]), 
			],
			20, 18, 0.7
		), 20, [326, 346]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			20, 25, 0.5
		), 20, [346, 386]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.2, .15, [1, 1, 0], [0, 0.2, 0.2]), 
			new rhyUnit(0.1, 0.4, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.2, 0.55, [1, 1, 0], [0, 0.2, 0.2]), 
			],
			20, 15, 0.7
		), 20, [386, 426]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			20, 25, 0.4
		), 20, [426, 446]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.4, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			20, 20, 0.65
		), 20, [446, 466]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.2, .15, [1, 1, 0], [0, 0.2, 0.2]), 
			new rhyUnit(0.1, 0.4, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.2, 0.55, [1, 1, 0], [0, 0.2, 0.2]), 
			],
			20, 17, 0.7
		), 20, [466, 486]
	),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, .125, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
			new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
			],
			21, 25, 0.5
		), 20, [486, 587]
	),
	new rhythmStruct([
		new rhyUnit(10, 0 , [1,1], [0,5])
	], 5,[507, 588]),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,743]),
	new rhythmStruct([
		new rhyUnit(1.4, 0, [0, 1, 0], [0, 0.7, 1.4]),
		new rhyUnit(1.4, 1.4, [0, 1, 0], [0, 0.7, 1.4]),
		new rhyUnit(1.4, 2.8, [0, 1, 0], [0, 0.7, 1.4]),
		new rhyUnit(1.4, 4.2, [0, 1, 0], [0, 0.7, 1.4]),
		new rhyUnit(1.4, 5.6, [0, 1, 0], [0, 0.7, 1.4]),
	], 7, [743,802]),
	new rhythmStruct([
		new rhyUnit(1.2, 0, [0, 1, 0], [0, 0.6, 1.2]),
		new rhyUnit(1.2, 1.2, [0, 1, 0], [0, 0.6, 1.2]),
		new rhyUnit(1.2, 2.4, [0, 1, 0], [0, 0.6, 1.2]),
		new rhyUnit(1.2, 3.6, [0, 1, 0], [0, 0.6, 1.2]),
		new rhyUnit(1.2, 4.8, [0, 1, 0], [0, 0.6, 1.2]),
	], 6, [802,808]),
	new rhythmStruct([
		new rhyUnit(1, 0, [0, 1, 0], [0, 0.5, 1]),
	], 1, [808,812]),
	new rhythmStruct([
		new rhyUnit(0.8, 0, [0, 1, 0], [0, 0.4, 0.8]),
		new rhyUnit(0.8, 0.8, [0, 1, 0], [0, 0.4, 0.8]),
		new rhyUnit(0.8, 1.6, [0, 1, 0], [0, 0.4, 0.8]),
		new rhyUnit(0.8, 2.4, [0, 1, 0], [0, 0.4, 0.8]),
		new rhyUnit(0.8, 3.2, [0, 1, 0], [0, 0.4, 0.8]),
	], 4, [812,816]),
	new rhythmStruct([
		new rhyUnit(0.6, 0, [0, 1, 0], [0, 0.3, 0.6]),
		new rhyUnit(0.6, .6, [0, 1, 0], [0, 0.3, 0.6]),
		new rhyUnit(0.6, 1.2, [0, 1, 0], [0, 0.3, 0.6]),
		new rhyUnit(0.6, 1.8, [0, 1, 0], [0, 0.3, 0.6]),
		new rhyUnit(0.6, 2.4, [0, 1, 0], [0, 0.3, 0.6]),
	], 3, [816,819]),
	new rhythmStruct([
		new rhyUnit(0.4, 0, [0, 1, 0], [0, 0.2, 0.4]),
		new rhyUnit(0.4, 0.4, [0, 1, 0], [0, 0.2, 0.4]),
		new rhyUnit(0.4, 0.8, [0, 1, 0], [0, 0.2, 0.4]),
		new rhyUnit(0.4, 1.2, [0, 1, 0], [0, 0.2, 0.4]),
		new rhyUnit(0.4, 1.6, [0, 1, 0], [0, 0.2, 0.4]),
	], 2, [819,821]),
	new rhythmStruct([
		new rhyUnit(0.2, 0, [0, 1, 0], [0, 0.1, 0.2]),
		new rhyUnit(0.2, 0.2, [0, 1, 0], [0, 0.1, 0.2]),
		new rhyUnit(0.2, 0.4, [0, 1, 0], [0, 0.1, 0.2]),
		new rhyUnit(0.2, 0.6, [0, 1, 0], [0, 0.1, 0.2]),
		new rhyUnit(0.2, 0.8, [0, 1, 0], [0, 0.1, 0.2]),
	], 1, [821,2800]),
];

// Viola
Parts[12].rhythmsa = [
	new rhythmStruct([new rhyUnit(7, 0, [0, 1, 0.2, 0], [0, 2, 6, 7])], 10, [0, 299]),
	new rhythmStruct([
		//p 1
		new rhyUnit(0.1, 0, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 0.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.2, 0.5, [1, 1, 0], [0, 0.2, 0.2]),
		new rhyUnit(0.1, 0.75, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 0.875, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 1, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 1.125, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 1.25, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 1.5, [1, 1, 0], [0, 0.1, 0.1]),
		//p 2
		new rhyUnit(0.1, 2, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 2.125, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 2.25, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.1, 2.375, [1, 1, 0], [0, 0.1, 0.1]), 
		new rhyUnit(0.2, 2.5, [1, 1, 0], [0, 0.2, 0.2]),
		new rhyUnit(0.1, 2.75, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 2.875, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(0.1, 3, [1, 1, 0], [0, 0.1, 0.1]),
		new rhyUnit(6.75, 3.25, [1, 0], [0, 6.75]),
	], 10,[299, 588]),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,743]),
	new rhythmStruct([
		new rhyUnit(1.6, 0, [0, 1, 0], [0, 0.8, 1.6]),
		new rhyUnit(1.6, 1.6, [0, 1, 0], [0, 0.8, 1.6]),
		new rhyUnit(1.6, 3.2, [0, 1, 0], [0, 0.8, 1.6]),
		new rhyUnit(1.6, 4.8, [0, 1, 0], [0, 0.8, 1.6]),
		new rhyUnit(1.6, 6.4, [0, 1, 0], [0, 0.8, 1.6]),
	], 8, [743,816]),
	new rhythmStruct([
		new rhyUnit(1.6, 0, [0, 1], [0, 1.6]),
		new rhyUnit(1.6, 1.6,  [0, 1], [0, 1.6]),
		new rhyUnit(1.6, 3.2,  [0, 1], [0, 1.6]),
		new rhyUnit(1.6, 4.8,  [0, 1], [0, 1.6]),
		new rhyUnit(1.6, 6.4,  [0, 1], [0, 1.6]),
	], 8, [816,2800]),
];
// Cello
Parts[13].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(7, 0, [0, 1, 0.2, 0], [0, 2, 6, 7]),
		new rhyUnit(9, 7, [0, 1, 0.7, 0], [0, 2, 6, 9]),
		new rhyUnit(6, 16, [0, 1, 1, 0], [0, 2, 4, 6])
	], 22, [0,92]),
	new rhythmStruct([
		new rhyUnit(4, 0, [0, 1, 0.2, 0], [0, 2, 3, 4]),
		new rhyUnit(2, 4, [1,1,0], [0, 1,2]),
		new rhyUnit(6, 6, [0, 1, 1, 0], [0, 2, 4, 6])
	], 12, [92,140]),
	new rhythmStruct([
		new rhyUnit(5, 0, [0, 1, 0.2, 0], [0, 2, 4, 5]),
		new rhyUnit(2, 5, [1,1,0], [0, 1,2]),
		new rhyUnit(7, 7, [0, 1, 1, 0], [0, 2, 5, 7])
	], 14, [140,168]),
	new rhythmStruct([
		new rhyUnit(3, 0, [0, 1, 0], [0, 1, 3]),
		new rhyUnit(2, 3, [1,1,0], [0, 1,2]),
		new rhyUnit(5, 5, [0, 1, 1, 0], [0, 2, 3, 5])
	], 10, [168,188]),
	new rhythmStruct([
		new rhyUnit(5, 0, [0, 1, 0.2, 0], [0, 2, 4, 5]),
		new rhyUnit(2, 5, [1,1,0], [0, 1,2]),
		new rhyUnit(7, 7, [0, 1, 1, 0], [0, 2, 5, 7])
	], 14, [188,216]),
	new rhythmStruct([
		new rhyUnit(4, 0, [0, 1, 0.2, 0], [0, 2, 3, 4]),
		new rhyUnit(2, 3, [1,1,0], [0, 1,2]),
		new rhyUnit(5, 5, [0, 1, 1, 0], [0, 2, 3, 5])
	], 10, [168,188]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.3, 0, [1, 1, 0], [0, 0.3, 0.3])],
			20, 25, 0.3
	), 22, [249, 588]),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,748]),
	new rhythmStruct([
		new rhyUnit(1.8, 0, [0, 1, 0], [0, 0.9, 1.8]),
		new rhyUnit(1.8, 1.8, [0, 1, 0], [0, 0.9, 1.8]),
		new rhyUnit(1.8, 3.6, [0, 1, 0], [0, 0.9, 1.8]),
		new rhyUnit(1.8, 5.4, [0, 1, 0], [0, 0.9, 1.8]),
		new rhyUnit(1.8, 7.2, [0, 1, 0], [0, 0.9, 1.8]),
	], 9, [748,804]),
	new rhythmStruct([
		new rhyUnit(1.6, 0, [0, 1], [0, 1.6]),
		new rhyUnit(1.6, 1.6,  [0, 1], [0, 1.6]),
		new rhyUnit(1.6, 3.2,  [0, 1], [0, 1.6]),
		new rhyUnit(1.6, 4.8,  [0, 1], [0, 1.6]),
		new rhyUnit(1.6, 6.4,  [0, 1], [0, 1.6]),
	], 8, [804,2800]),
];
// Contrabass
Parts[14].rhythmsa = [
	new rhythmStruct([
		new rhyUnit(7, 0 , [1, 0], [0, 7])
	], 8, [0,90]),
	new rhythmStruct([
		new rhyUnit(6, 0 , [1, 0], [0, 6])
	], 7, [90,114]),
	new rhythmStruct([
		new rhyUnit(5, 0 , [1, 0], [0, 5])
	], 6, [114,131]),
	new rhythmStruct([
		new rhyUnit(4, 0 , [1, 0], [0, 4])
	], 5, [131,148]),
	new rhythmStruct([
		new rhyUnit(4, 0 , [1, 0], [0, 4])
	], 4, [148,160]),
	new rhythmStruct([
		new rhyUnit(3, 0 , [1, 1, 0], [0, 1.5, 3])
	], 3, [160,166]),
	new rhythmStruct([
		new rhyUnit(2, 0 , [1, 1, 0], [0, 1.25, 2])
	], 2, [166,177]),
	new rhythmStruct([
		new rhyUnit(0.95, 0 , [1, 1, 0], [0, 0.95, 0.95])
	], 1, [177,393]),
	new rhythmStruct(
		randomlyPlaceStruct(
			[new rhyUnit(0.3, 0, [1, 1], [0, 0.3]), 
			new rhyUnit(0.3, .333, [1, 1], [0, 0.3])
			],
			20, 15, 0.25
		), 20, [393, 490]
	),
	new rhythmStruct([
		new rhyUnit(1.4, 0, [1,1, 0], [0, 1.4, 1.4]),
		new rhyUnit(1.4, 1.5, [1,1, 0], [0, 1.4, 1.4])
	], 3, [490, 588]),
	new rhythmStruct([
		new rhyUnit(16, 0, [1, 1, 0], [0, 6, 16])
	], 16, [588,604]),
	new rhythmStruct([
		new rhyUnit(8, 0, [0, 1, 0], [0, 4, 8])
	], 8, [604,692]),
	new rhythmStruct([
		new rhyUnit(6, 0, [0, 1, 0], [0, 3, 6])
	], 6, [692,2800]),
]
var partRhythmsString = "";
for(var i = 0; i<Parts.length; i++){
	partRhythmsString = partRhythmsString.concat("\n", Parts[i].name, "\n");
	for(var s = 0; s< Parts[i].rhythmsa.length; s++){
		partRhythmsString = partRhythmsString.concat(Parts[i].rhythmsa[s].interval[0], "	");
		for(var x = 0; x< Parts[i].rhythmsa[s].units.length; x++){
			partRhythmsString = partRhythmsString.concat( Parts[i].rhythmsa[s].units[x].time, ", ", Parts[i].rhythmsa[s].units[x].duration, "	");
		}
		partRhythmsString = partRhythmsString.concat("\n");
	}
}
function loadPartNotes(){
	for(var part =0; part < Parts.length; part++){
		console.log(Parts[part].name);
		var timeBetween = 98;
		var holdLength = 16;
		var measures1 = partXML.part[part].measure;
		var measures = [];
		for(var i = 0; i <measures1.length; i++){
			measures.push(measures1[i].note[0]);
		}
		Parts[part].goalNotes =[];
		for(var i = 0; i < measures.length; i++){
			if(i>0){
				if(measures[i].rest !== undefined){
					Parts[part].goalNotes.push(new goalNote(Parts[part].goalNotes[i-1].note, "r", i*timeBetween, holdLength));
				}else{
					console.log(measures[i].pitch[0]);
					var step = measures[i].pitch[0].step[0];
					if(measures[i].pitch[0].alter !== undefined && measures[i].pitch[0].alter[0] == "1"){
						step = step.concat("#");
					}
					var octave = measures[i].pitch[0].octave[0];
					var cpitch = convXMLMidi(step, octave);
					Parts[part].goalNotes.push(new goalNote(Parts[part].goalNotes[i-1].note, cpitch, i*timeBetween, holdLength));
				}
			}else{
				if(measures[0].rest !== undefined){
					Parts[part].goalNotes.push(new goalNote("r", "r", i*timeBetween, holdLength));
				}else{
					var step = measures[0].pitch[0].step[0];
					var octave = measures[0].pitch[0].octave[0];
					var cpitch = convXMLMidi(step, octave);
					Parts[part].goalNotes.push(new goalNote(cpitch, cpitch, i*timeBetween, holdLength));
				}
			}
		}
		totalTime = Parts[0].goalNotes[Parts[0].goalNotes.length-1].time+Parts[0].goalNotes[Parts[0].goalNotes.length-1].hold;
	}
}

function loadDoc(){
	var parser = new xml2js.Parser();
	fs.readFile(__dirname + '/Current Score.xml','utf8', function(err, data){
		parser.parseString(data, function(err, res){
			partXML = res['score-partwise'];
			//console.log(partXML);
			loadPartNotes();
			main();
		});
	});
}
function convXMLMidi(apitch, aoctave){
	aoctave = parseInt(aoctave);
	var noteLoc = scale.indexOf(apitch);
	var retV = (aoctave+1)*12+noteLoc;
	return retV;
}
loadDoc();
function main(){
	for(var part = 0; part<Parts.length; part++){
		Parts[part].setGoalIntervals();
	}
	generateSequence();
}


app.get('/', function (req, res) {
	res.sendFile(__dirname + '/index.html');
});
app.get('/Parts.json', function (req, res) {
	res.json(Parts);
});

app.use(express.static('files'));
app.use('/timesync', timesyncServer.requestHandler);

io.on('connection', (socket) => {
  console.log('a user connected');
  console.log(currentTime);
  socket.on('disconnect', () => {
	console.log('user disconnected'); 
  });
  socket.on('message', (msg) => {
    console.log('message: ' + msg);
	var msgspl = msg.split(",");
	if(msgspl[0] == "CompClock"){
		currentTime = parseInt(msgspl[1]);
	}
	io.emit('message', msg);
  });
});
var pword;
http.listen(process.env.PORT || 3000, () => {
	pword = Math.round(Math.random()*9).toString()+Math.round(Math.random()*9).toString()+Math.round(Math.random()*9).toString()+Math.round(Math.random()*9).toString()
	console.log(`Server running on port 3000, Passcode:`+pword);
});
require('dns').lookup(require('os').hostname(), function (err, add, fam) {
  console.log('addr: '+add);
})