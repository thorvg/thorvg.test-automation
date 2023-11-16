const ConsoleLogTypes = { None : '', Inner : 'console-type-inner', Error : 'console-type-error', Warning : 'console-type-warning' };

//console message
function consoleLog(message, type = ConsoleLogTypes.None) {
	console.log(message);
}

//for playing animations
function animLoop() {
	const player = window.player;

	if (!player) return;
	if (player.update()) {
		player.render();
		// refreshProgressValue()
		window.requestAnimationFrame(animLoop);
	}
}

class Player {
	filetype = "unknown";		//current file format: (tvg, svg, json)
	curFrame = 0;
	beginTime = 0;
	totalFrame = 0;
	repeat = true;
	playing = false;
	highlighted = false;

    canvas = {};
    tvg = {};
	player = window.player;

	flush() {
		var context = this.canvas.getContext('2d');

		//draw the content image first
		context.putImageData(this.imageData, 0, 0);

		//draw the highlight image later
		if (this.highlighted) {
			context.fillStyle = "#5a8be466";
			context.fillRect(this.geomHighlight[0], this.geomHighlight[1], this.geomHighlight[2], this.geomHighlight[3]);
		}
	}

	render() {
		this.tvg.resize(this.canvas.width, this.canvas.height);
		if (this.tvg.update() === true) {
			var buffer = this.tvg.render();
			var clampedBuffer = Uint8ClampedArray.from(buffer);
			if (clampedBuffer.length == 0) return;
			this.imageData = new ImageData(clampedBuffer, this.canvas.width, this.canvas.height);

			this.flush();
		}
	}

	update() {
		if (!this.playing) return false;

		this.curFrame = ((Date.now() / 1000) - this.beginTime) / this.tvg.duration() * this.totalFrame;

		//finished
		if (this.curFrame >= this.totalFrame) {
			if (this.repeat) {
				this.play();
				return true;
			} else {
				this.playing = false;
				return false;
			}
		}
		return this.tvg.frame(this.curFrame);
	}

	stop() {
		player.playing = false;
		this.curFrame = 0;
		this.tvg.frame(0);
	}

	seek(frame) {
		this.frame(frame);
		this.update();
		this.render();
	}

	frame(curFrame) {
		this.pause();
		this.curFrame = curFrame;
		this.tvg.frame(this.curFrame);
	}

	pause() {
		player.playing = false;
	}

	play() {
		this.totalFrame = this.tvg.totalFrame();
		if (this.totalFrame === 0) return;
		this.beginTime = (Date.now() / 1000);
		if (!this.playing) {
			this.playing = true;
			window.requestAnimationFrame(animLoop);
		}
	}

	// loadData(data, filename) {
	// 	consoleLog("Loading file " + filename, ConsoleLogTypes.Inner);
	// 	var ext = filename.split('.').pop();
	// 	if (ext == "json") ext = "lottie";
	// 	if (this.tvg.load(new Int8Array(data), ext, this.canvas.width, this.canvas.height)) {
	// 		this.filename = filename;
	// 		this.render();
	// 		this.play();
	// 		refreshZoomValue();
	// 	} else {
	// 		alert("Unable to load an image (" + filename + "). Error: " + this.tvg.error());
	// 	}
	// }

	loadBytes(data) {
		if (this.tvg.load(new Int8Array(data), 'lottie', this.canvas.width, this.canvas.height)) {
			this.render();
			this.play();
		// // // 	// refreshZoomValue();
		} else {
			alert("Unable to load an image). Error: " + this.tvg.error());
		}

		// showImageCanvas();
	}

	// loadFile(file) {
	// 	let read = new FileReader();
	// 	read.readAsArrayBuffer(file);
	// 	read.onloadend = _ => {
	// 		this.loadData(read.result, file.name);
	// 		this.createTabs();
	// 		showImageCanvas();
	// 		enableZoomContainer();
	// 		enableProgressContainer();
	// 	}
	// }

	// loadUrl(url) {
	// 	let request = new XMLHttpRequest();
	// 	request.open('GET', url, true);
	// 	request.responseType = 'arraybuffer';
	// 	request.onloadend = _ => {
	// 		if (request.status !== 200) {
	// 			alert("Unable to load an image from url " + url);
	// 			return;
	// 		}
	// 		let name = url.split('/').pop();
	// 		this.loadData(request.response, name);
	// 		this.createTabs();
	// 		showImageCanvas();
	// 		enableZoomContainer();
	// 		deletePopup();
	// 	};
	// }

	// createTabs() {
	// 	//layers tab
	// 	var tvgNodes = this.tvg.layers();
	// 	var sceneGraph = document.getElementById("scene-graph");
	// 	sceneGraph.textContent = '';
	// 	var parent = sceneGraph;
	// 	var parentDepth = 1;

	// 	for (let i = 0; i < tvgNodes.length; i += 5) {
	// 		let id = tvgNodes[i];
	// 		let depth = tvgNodes[i + 1];
	// 		let type = tvgNodes[i + 2];
	// 		let opacity = tvgNodes[i + 3];
	// 		let compositeMethod = tvgNodes[i + 4];

	// 		if (depth > parentDepth) {
	// 			var block = createLayerBlock(depth);
	// 			parent = parent.appendChild(block);
	// 			parentDepth = depth;
	// 		} else if (depth < parentDepth) {
	// 			while (parent.getAttribute('tvg-depth') > depth) {
	// 				parent = parent.parentNode;
	// 			}
	// 			parentDepth = depth;
	// 		}
	// 		parent.appendChild(createSceneGraph(id, depth, type, compositeMethod, opacity));
	// 	}

	// 	//file tab
	// 	var size = Float32Array.from(this.tvg.size());
	// 	var sizeText = ((size[0] % 1 === 0) && (size[1] % 1 === 0)) ?
	// 		size[0].toFixed(0) + " x " + size[1].toFixed(0) :
	// 		size[0].toFixed(2) + " x " + size[1].toFixed(2);

	// 	var file = document.getElementById("file");
	// 	file.textContent = '';
	// 	file.appendChild(createHeader("Details"));
	// 	file.appendChild(createTitleLine("Filename", this.filename));
	// 	file.appendChild(createTitleLine("Resolution", sizeText));
	// 	file.appendChild(createHeader("Export"));
	// 	var lineExportCompressedTvg = createPropertyLine("Export .tvg file (compression)");
	// 	lineExportCompressedTvg.addEventListener("click", () => {player.save(true)}, false);
	// 	file.appendChild(lineExportCompressedTvg);
	// 	var lineExportNotCompressedTvg = createPropertyLine("Export .tvg file (no compression)");
	// 	lineExportNotCompressedTvg.addEventListener("click", () => {player.save(false)}, false);
	// 	file.appendChild(lineExportNotCompressedTvg);
	// 	var lineExportPng = createPropertyLine("Export .png file");
	// 	lineExportPng.addEventListener("click", exportCanvasToPng, false);
	// 	file.appendChild(lineExportPng);

	// 	//switch to file list in default.
	// 	onShowFilesList();
	// }

	save(compress) {
		if (this.tvg.save(compress)) {
			let data = FS.readFile('output.tvg');
			if (data.length < 33) {
				alert("Unable to save the TVG data. The generated file size is invalid.");
				return;
			}

			var blob = new Blob([data], {type: 'application/octet-stream'});

			var link = document.createElement("a");
			link.setAttribute('href', URL.createObjectURL(blob));
			link.setAttribute('download', changeExtension(player.filename, "tvg"));
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} else {
			let message = "Unable to save the TVG data. Error: " + this.tvg.error();
			consoleLog(message, ConsoleLogTypes.Error);
			alert(message);
		}
	}

	highlight(id) {
		this.highlighted = true;
		this.geomHighlight= Float32Array.from(this.tvg.geometry(id));
		//don't need to flush because the animation do refresh.
		if (!this.playing) this.flush();
	}

	unhighlight() {
		this.highlighted = false;
		//don't need to flush because the animation do refresh.
		if (!this.playing) this.flush();
	}

	setOpacity(id, opacity) {
		this.tvg.opacity(id, opacity);
		if (!this.playing) this.render();
	}

	constructor() {
		this.tvg = new window.Module.TvgWasm();
		this.canvas = document.getElementById("thorvg-canvas");
		consoleLog("ThorVG module loaded correctly", ConsoleLogTypes.Inner);
	}
}

export default Player;
