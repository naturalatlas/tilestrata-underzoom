var _ = require('lodash');
var async = require('async');
var Mapnik = require('mapnik');
var tilebelt = require('tilebelt');

var getTileCoords = function(x, y, z, depth) {
	var baseTile = [x, y, z];
	if (depth === 1) return tilebelt.getChildren(baseTile);

	var tiles = [baseTile];
	for (var i = 0; i < depth; i++) {
		var _tiles = [];
		for (var j = 0, n = tiles.length; j < n; j++) {
			_tiles = _tiles.concat(tilebelt.getChildren(tiles[j]));
		}
		tiles = _tiles;
	}
	return tiles;
};

module.exports = function(options) {
	options = options || {};

	_.defaults(options, {
		inputSize: 256,
		outputSize: 256,
		format: 'png',
		scaling: 'lanczos',
		source: null,
		matte: null,
		errorOnTileNotFound: false
	});

	if (options.size) {
		options.inputSize = options.outputSize = options.size;
	}

	return {
		name: 'underzoom',
		serve: function(server, req, callback) {
			var underzoomLevels = (typeof options.zooms === 'number') ? options.zooms : options.zooms[req.z];
			if (!underzoomLevels) {
				return options.source.serve(server, req, callback);
			}

			var tiles, result, images, matte;
			var canvasSize = options.inputSize * Math.pow(2, underzoomLevels);
			var canvas = new Mapnik.Image(canvasSize, canvasSize);

			async.series([
				function prepareImage(callback) {
					if (!options.matte) return canvas.premultiply(callback);
					canvas.fill(new Mapnik.Color('#' + options.matte), function(err) {
						if (err) return callback(err);
						canvas.premultiply(callback);
					});
				},
				function startFetchAndComposite(callback) {
					var coordList = getTileCoords(req.x, req.y, req.z, underzoomLevels);
					var originCoords = coordList[0];
					async.each(coordList, function(coords, callback) {
						var x = (coords[0] - originCoords[0]) * options.inputSize;
						var y = (coords[1] - originCoords[1]) * options.inputSize;
						var childReq = req.clone();
						childReq.x = coords[0];
						childReq.y = coords[1];
						childReq.z = coords[2];
						options.source.serve(server, childReq, function(err, childBuffer, childHeaders) {
							if (err && (err.statusCode !== 404 && err.statusCode !== 403)) return callback(err);
							if (err && (err.statusCode === 404 || err.statusCode === 403)) return callback(options.errorOnTileNotFound ? err : null);
							if (!childBuffer) return callback();
							Mapnik.Image.fromBytes(childBuffer, function(err, image) {
								if (err) return callback(options.errorOnTileNotFound ? err : null); // ignore and treat as transparent
								image.premultiply(function(err) {
									if (err) return callback(err);
									canvas.composite(image, {
										comp_op: Mapnik.compositeOp.src_over,
										dx: x,
										dy: y,
										opacity: 1
									}, callback);
								});
							});
						});
					}, callback);
				}
			], function(err) {
				if (err) return callback(err);
				canvas.resize(options.outputSize, options.outputSize, {scaling_method: Mapnik.imageScaling[options.scaling]}, function(err, canvas) {
					if (err) return callback(err);
					canvas.demultiply(function(err) {
						if (err) return callback(err);
						canvas.encode(options.format, function(err, buffer) {
							if (err) return callback(err);
							callback(null, buffer, {'Content-Type': 'image/' + options.format});
						});
					});
				});
			});
		}
	};
};
