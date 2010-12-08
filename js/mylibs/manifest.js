// Requires utils.js, underscore.js, json2.js, and S3Ajax.js (with S3Ajax object initialized with key and secret)
Manifest = function(bucket) {
	var filename = 'manifest.json';
	var structure = { // the default file structure
		meta: { // meta-information
			version: 2,
			dirty: false, // whether the file has been changed
			keys: [], // an array of all song keys in the bucket
			key_hash: {} // a hash key -> {artist, album, track} of all keys
			
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
			
			if (file_found) { // grab it
				S3Ajax.get(bucket, filename, function(req, resp) {
					var manifest_structure = JSON.parse(resp);
					if (manifest_structure.meta.version != structure.meta.version) { // just blow it away, needs to be rebuilt
						S3Ajax.put(bucket, filename, JSON.stringify(structure), {}, function(req, obj) {
							callback(structure.song_db);
						});
					} else { // use it
						callback(structure.song_db);
					}
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
	
	var unhandled_special_characters = ["é"];
	var has_special_characters = function(string) {
		return !_(string).chain()
			.toArray()
			.intersect(unhandled_special_characters)
			.isEmpty()
			.value();
	}
	
	
	return {
		bucket: bucket,
		
		syncd: false, // has the db yet been grabbed from s3?
		dirty: true,
		db: {},
		keys: function() { return structure.meta.keys },
		add_key: function(opts) { // key, artist, album, track 
			structure.meta.keys.push(opts.key);
			structure.meta.key_hash[opts.key] = {artist: opts.artist, album: opts.album, track: opts.track};
		},
		
		song_for_key: function(key) {
			if (structure.meta.keys.indexOf(key) == -1) {
				throw 'key \'' + key + '\' not found';
			} else {
				var info = structure.meta.key_hash[key];
				return Song({
					key: key,
					track: info.track,
					title: this.db[info.artist][info.album][info.track].title,
					album: info.album,
					artist: info.artist
				});
			}
		},
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
				result.push(album);
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
		
		add_song: function(opts) { // track, title, album, artist, key
			if (!this.syncd) { // haven't grabbed the file
				var that = this;
				this.sync({
					update: false,
					callback: function() {
						return that.add_song(opts);
					}
				});
			} else { // we know we have a db
				if (!this.db[opts.artist])
					this.db[opts.artist] = {};
				
				if (!this.db[opts.artist][opts.album])
					this.db[opts.artist][opts.album] = {};
				db_album = this.db[opts.artist][opts.album];
				
				db_album[opts.track] = {title: opts.title, key: opts.key};
				this.add_key(opts);
				if (opts.callback) {
					return {title: opts.title, album: opts.album, artist: opts.artist, key: opts.key}
				}
			}
		},
		sync: function(opts) { // update, callback()
			if (this.syncd) {
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
					
					if (opts.update)
						that.update(opts.callback);
				});
			}
		},
		
		update: function(callback) { // function()
			var that = this;
			S3Ajax.listKeys(this.bucket, {}, function(req, obj) {
				var new_keys = _(that.keys()).reduce(function(memo, cur) {
					return _(memo).without(cur);
				}, _(obj.ListBucketResult.Contents).chain()
				.map(function(content) { return content.Key})
				.select(function(key) {return key.match(/mp3$/) && !has_special_characters(key)})
				.value());
								
				var keys_left = new_keys.length;
				var new_songs = [];
				for(i=0; i < new_keys.length; i++) {
					var key = new_keys[i];
					// grab the tags
					(function(key, bucket_name) {
						ID3.loadTags(Utils.url(bucket_name, key), function() {
						    var tags = ID3.getAllTags(Utils.url(bucket_name, key));
							if (tags) {
								try {
									new_songs.push({
										title: tags.title,
										artist: tags.artist,
										album: tags.album,
										track: parseInt(tags.track.split('/')[0]),
										key: key,
									});
								} catch (err) {
									console.log('error getting track for ' + tags.title + ', ' + err);
								}
							}
							
							// whether or not we added the song, decrement and check if we're the last
							keys_left -= 1;
							if (keys_left == 0) {
								for (j=0; j < new_songs.length; j++) {
									that.add_song(new_songs[j]);
								}
								if (callback) callback();
							}
						});
					})(key, that.bucket);
				}
			});
		}
	}
}