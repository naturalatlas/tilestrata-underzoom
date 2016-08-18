var fs = require('fs');
var tilestrata = require('tilestrata');
var TileServer = tilestrata.TileServer;
var TileRequest = tilestrata.TileRequest;
var underzoom = require('../index.js');
var assert = require('chai').assert;
var fs = require('fs');

var sourceBuffers = {
	'20/20': fs.readFileSync(__dirname + '/data/a.png'),
	'21/20': fs.readFileSync(__dirname + '/data/b.png'),
	'21/21': fs.readFileSync(__dirname + '/data/d.png'),
	'20/21': fs.readFileSync(__dirname + '/data/c.png'),
};

describe('tilestrata-underzoom', function() {
	describe('serve()', function() {
		var server = new TileServer();

		var sourceProvider = {
			serve: function(server, req, callback) {
				var buffer = sourceBuffers[req.x + '/' + req.y];
				if (req.z <= 5) buffer = sourceBuffers['20/20'];
				if (req.z >= 9) buffer = sourceBuffers[(20 + req.y % 2) + '/' + (20 + req.x % 2)];
				return callback(null, buffer, {'Content-Type': 'image/png'});
			}
		};

		var provider = underzoom({
			source: sourceProvider,
			zooms: {
				6: 1,
				7: 2,
			}
		});

		it('should handle non-underzoomed zooms', function(done) {
			provider.serve(server, TileRequest.parse('/dummy/5/10/10/t.png'), function(err, buffer, headers) {
				if (err) throw err;
				assert.equal(buffer, sourceBuffers['20/20']);
				done();
			});
		});
		it('should underzoom tiles', function(done) {
			provider.serve(server, TileRequest.parse('/dummy/6/10/10/t.png'), function(err, buffer, headers) {
				if (err) throw err;
				var fixture = __dirname + '/fixtures/out.png';
				fs.writeFileSync(fixture, buffer);
				assert.deepEqual(headers, {'Content-Type': 'image/png'}, headers);
				done();
			});
		});
		it('should underzoom tiles (2 levels)', function(done) {
			provider.serve(server, TileRequest.parse('/dummy/7/10/10/t.png'), function(err, buffer, headers) {
				if (err) throw err;
				var fixture = __dirname + '/fixtures/out2.png';
				fs.writeFileSync(fixture, buffer);
				assert.deepEqual(headers, {'Content-Type': 'image/png'}, headers);
				done();
			});
		});
	});
});
