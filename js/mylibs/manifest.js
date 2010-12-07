// Requires json2.js and S3Ajax.js (with S3Ajax object initialized with key and secret)
Manifest = function(bucket) {
	var filename = 'manifest.json';
	var structure = { // the default file structure
		meta: { // meta-information
			version: 1,
			dirty: false, // whether the file has been changed
			keys: [] // a cache of all keys in the bucket
		},
		song_db: {} // the actual artist/album/song structure
	};
	
	var save_db = function(db, callback) {
		S3Ajax.put(bucket, filename, JSON.stringify(structure), {}, function(req, obj) {
			callback(structure.song_db);
		});
		
	}
	var get_db = function(callback) {// function(db)
		S3Ajax.listKeys(bucket, {}, function(req, obj) {
			var file_found = false;
			for (i=0; i < obj.ListBucketResult.Contents.length; i++) {
				if(obj.ListBucketResult.Contents[i].Key == filename) {
					file_found = true;
					break;
				}
			}
			
			if (file_found) { // get it
				S3Ajax.get(bucket, filename, function(req, resp) {
					var structure = JSON.parse(resp);
					callback(structure.song_db);
				}, function(req, obj) {
					throw "InvalidCreds";
				});
			} else { // create it
				S3Ajax.put(bucket, filename, JSON.stringify(structure), {}, function(req, obj) {
					callback(structure.song_db);
				});
			}
			
		}, function(req, obj) {
			throw "InvalidCreds";
		});
	}
	
	
	return {
		bucket: bucket,
		
		syncd: false, // has the db yet been grabbed from s3?
		dirty: true,
		db: {},
		keys: function() { return structure.meta.keys },
		add_key: function(key) { structure.meta.keys.push(key) }, // look (in JS: TGP) for how to make this private
		
		arists: function() {
			var result = [];
			for(var artist in this.db) {
				result.push(artist);
			}
			
			result.sort();
			return result;
		},
		artist_albums: function(artist_name) {
			var result = [];
			for(var album in this.db[artist_name]) {
				result.push(artist);
			}
			
			result.sort();
			return result;
		},
		artist_album_songs: function(artist, album) {
			var result = [];
			var sorted_nos = [];
			var db_songs = this.db[artist][album];
			for(var song_no in db_songs) {
				sorted_nos.push(song_no);
			}
			sorted_nos.sort(function(i, j){return i-j});
			
			for (i=0; i < sorted_nos.length; i++) {
				var song_no = sorted_nos[i];
				result.push(Song({
					key: db_songs[song_no].key,
					track: song_no,
					title: db_songs[song_no].title,
					artist: artist,
					album: album
				}));
			}
			
			return result;
		},
		
		add_song: function(opts) { // track, title, album, artist, key, callback(song_opts, db)
			if (!this.syncd) { // haven't grabbed the file
				var that = this;
				this.sync(function() {
					that.add_song(opts);
				});
			} else { // we know we have a db
				if (!this.db[opts.artist])
					this.db[opts.artist] = {};
				
				if (!this.db[opts.artist][opts.album])
					this.db[opts.artist][opts.album] = {};
				db_album = this.db[opts.artist][opts.album];
				
				db_album[opts.track] = {title: opts.title, key: opts.key};
				this.add_key(opts.key);
				if (opts.callback) {
					opts.callback({title: opts.title, album: opts.album, artist: opts.artist, key: opts.key}, this.db);
				}
			}
		},
		sync: function(callback) { // function()
			if (this.syncd) {
				var that = this;
				save_db(this.db, function() {
					that.dirty = false;
					if (callback)
						callback();
				});
			} else {
				var that = this;
				get_db(function(db) {
					that.db = db;
					that.syncd = true;
					that.dirty = false;
					if (callback)
						callback();
				});
			}
		}
	}
}