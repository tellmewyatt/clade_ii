var totalTime = 1192;
var messageCount = 0;
var Parts = [];
var scale = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B",];
var diatonicscale = ["C","D","E","F","G","A","B",];
var Notes = [];
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
		this.currentEnvTs = [];
		this.currentEnvPs = [];
		this.currentEnvEs = [];
		this.idNum = num;
		this.cStruct;
		this.cNoteX;
		this.cNoteY;
		this.appendedEnvs = false;
	}
	getNoteValues(pitch){
		// Returns y position, including staffy, number of ledger lines, and their position
		var clef= this.clef;
		var pitchcut = pitch.split("");
		var ypos;
		var octaveDisplacement = pitchcut[pitchcut.length-1]-4;
		var notepos = diatonicscale.indexOf(pitchcut[0])+(octaveDisplacement*7);
		var llines = 0;
		var abvbl = false;
		ctx.fillStyle="black";
		if(clef=="treble"){
			ypos = staffLineSpacing*(10-notepos)/2;
			if(notepos<=0){
				llines =  ~~((-notepos)/2)+1;
				abvbl = false;
			}if(notepos>=12){
				llines = ~~((notepos-12)/2)+1;
				abvbl = true;
			}
		}if(clef=="bass"){
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
		if(clef == "alto"){
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
		canvas1.fillStyle="black";
		if(clef=="treble"){
			var octaveDisplacement = pitchcut[pitchcut.length-1]-4;
			var notepos = diatonicscale.indexOf(pitchcut[0])+(octaveDisplacement*7);
			ypos = this.staffLineSpacing*(10-notepos)/2;
		}if(clef=="bass"){
			var octaveDisplacement = pitchcut[pitchcut.length-1]-4;
			var notepos = diatonicscale.indexOf(pitchcut[0])+(octaveDisplacement*7)-1;
			ypos = this.staffLineSpacing*(-3-notepos)/2;
		}
		if(clef == "alto"){
			var octaveDisplacement = pitchcut[pitchcut.length-1]-4;
			var notepos = diatonicscale.indexOf(pitchcut[0])+(octaveDisplacement*7)-7;
			ypos = this.staffLineSpacing*(-3-notepos)/2;
		}
		return ypos;
	}
	pushEnvs(possibleEnvs, possEnvsI, time){
		for(var x = 0; x< possibleEnvs.times.length; x++){
			var arr = [possEnvsI, false];
			if(x == possibleEnvs.times.length-1){
				arr = [possEnvsI, true];
			}
			this.currentEnvs.push(arr);
			this.currentEnvTs.push(possibleEnvs.times[x]-time);
		}
	}
	appendEnvs(time = 0){
		if(!this.appendedEnvs){
			this.currentEnvs = [];
			this.currentEnvTs = [];
			if(time != 0){
				var possibleEnvs = [];
				var possEnvsI = [];
				for(var r =0; r < this.rhythms.length; r++){
					if(time >= this.rhythms[r].interval[0]
					&& time < this.rhythms[r].interval[1]){
						possibleEnvs.push(this.rhythms[r]);
						possEnvsI.push(r);
					}
					if(time+5 >= this.rhythms[r].interval[0]
					&& time+5 < this.rhythms[r].interval[1] && this.rhythms[r] != possibleEnvs[0]){
						possibleEnvs.push(this.rhythms[r]);
						possEnvsI.push(r);
					}
				}if(possibleEnvs === undefined || possibleEnvs.length < 1){
					for(var r =1; r < this.rhythms.length; r++){
						if(time >= this.rhythms[r-1].interval[1]
						&& time < this.rhythms[r].interval[0]){
							possibleEnvs.push(this.rhythms[r]);
							possEnvsI.push(r);
							//console.log(this.name, this.rhythms, time);
							break;
						}
					}
				}
				for(var i =0; i< possibleEnvs.length; i++){
					//console.log(this.name, possibleEnvs[i]);
					this.pushEnvs(possibleEnvs[i],possEnvsI[i], time);
					/*for(var x = 0; x< possibleEnvs[i].times.length; x++){
						this.currentEnvs.push(possEnvsI[i]);
						this.currentEnvTs.push(possibleEnvs[i].times[x]-time);
					}*/
				}
			}else{
				var possibleEnvs = [];
				possibleEnvs.push(this.rhythms[0]);
				var possEnvsI = [];
				possEnvsI.push(0);
				for(var i =0; i< possibleEnvs.length; i++){
					//console.log(this.name, possibleEnvs[i]);
					this.pushEnvs(possibleEnvs[i],possEnvsI[i], time);
					/*for(var x = 0; x< possibleEnvs[i].times.length; x++){
						this.currentEnvs.push(possEnvsI[i]);
						this.currentEnvTs.push(possibleEnvs[i].times[x]-time);
					}*/
				}
			}
			this.appendedEnvs = true;
		}else if(this.currentEnvs !== undefined && this.currentEnvs.length > 0){
			for(var i =0; i < this.currentEnvTs.length; i++){
				this.currentEnvTs[i]--;
			}
			if(time+5 == this.rhythms[this.currentEnvs[this.currentEnvs.length-1][0]].interval[1]){
				var nextI = this.currentEnvs[this.currentEnvs.length-1][0]+1;
				if(this.rhythms[nextI]!== undefined){
					this.pushEnvs(this.rhythms[nextI],nextI, time);
					/*
					for(var i =0; i<this.rhythms[nextI].times.length; i++){
						this.currentEnvs.push(nextI);
						this.currentEnvTs.push(this.rhythms[nextI].times[i]-time);
					}*/
				}
			}
			try{
				while(this.currentEnvTs[0] < -this.rhythms[this.currentEnvs[0][0]].totalTime){
					this.currentEnvTs.shift();
					this.currentEnvs.shift();
				}
			}catch{
				console.log("ERROR:", this.name, time, this.currentEnvTs, this.rhythms, this.currentEnvs, this.currentEnvs[0]);
			}
		}
	}
	checkNoteChange(time){
		if(this.sequence[time] == this.sequence[time+1]){
			return true;
		}else{
			return false;
		}
	}
	findNextNotes(time){
		var ret1 = [];
		var ret2 = [];
		for(var i = 1; i < 6; i++){
			if(this.sequence[time+i] != undefined && this.sequence[time+i] != this.sequence[time+i-1]){
				if(this.sequence[time+i] != "r"){
					ret1.push(Notes[this.sequence[time+i]]);
				}else{
					ret1.push("r");
				}
				ret2.push(i);
			}
		}
		return [ret1,ret2];
	}
}
onmessage = function(e) {
	if (messageCount == 0){
		// Set Note Values
		for (var i=0; i< 127; i++){
			var octave = Math.trunc(i/12)-1;
			var note = scale[i%12] + octave;
			Notes.push(note);
		}
		for(var i = 0; i <e.data.length; i++){
			Parts.push(Object.assign(new Part(), e.data[i]));
		}
		messageCount++;
		
	}
	else{
		// passed an array of 2 variables: CompClock and Init
		var ret = [];
		var ret1 = [];
		var ret2 = [];
		var ret3 = [];
		var ret4 = [];
		var ret5 = [];
		for(var p = 0; p< Parts.length; p++){
			var nextNoteArrs = Parts[p].findNextNotes(e.data[0]);
			if(Parts[p].sequence[e.data[0]] != "r"){
				ret1.push(Notes[Parts[p].sequence[e.data[0]]]);
			}else{
				ret1.push("r");
			}
			ret2.push(nextNoteArrs[0]);
			ret3.push(nextNoteArrs[1]);
			if(e.data[1]){
				Parts[p].appendedEnvs = false;
			}
			Parts[p].appendEnvs(e.data[0]);
			if(Parts[p].currentEnvs !== undefined){
				ret4.push(Parts[p].currentEnvs);
				ret5.push(Parts[p].currentEnvTs);
			}
		}
		//console.log(ret4, ret5);
		postMessage([ret1,ret2,ret3, ret4, ret5]);
	}
}