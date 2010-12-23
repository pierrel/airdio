// Requires utils.js, underscore.js, json2.js, and S3Ajax.js (with S3Ajax object initialized with key and secret)
Manifest = function(opts) {
	var filename = 'airdio_manifest.json';
	var structure = { // the default file structure
		meta: { // meta-information
			version: 3, // added tag cloud
			dirty: false, // whether the file has been changed
			keys: [], // an array of all song keys in the bucket
			key_hash: {} // a hash key -> {artist, album, title, tags} of all keys
			
		},
		song_db: {}, // the actual artist/album/song structure
		tag_cloud: {} // {tag_name: [song key array], ...}
	};
	var bucket = opts.bucket;
	var lastfm = opts.lastfm;
	
	var save_db = function(opts) {
		var db = opts.db || structure.song_db;
		var tag_cloud = opts.tag_cloud || structure.tag_cloud;
		var callback = opts.callback;
		
		// set the new structures
		structure.song_db = db;
		structure.tag_cloud = tag_cloud;
		
		S3Ajax.put(bucket, filename, JSON.stringify(structure), {}, function(req, obj) {
			if (callback) callback(structure.song_db);
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
						structure = manifest_structure;
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
		tag_cloud: {},
		keys: function() { return structure.meta.keys },
		add_key: function(opts) { // key, artist, album, track 
			structure.meta.keys.push(opts.key);
			structure.meta.key_hash[opts.key] = {artist: opts.artist, album: opts.album, track: opts.track, tags: opts.tags};
		},
		
		//
		// Events
		//
		song_loaded_fn: null,
		song_loaded: function(fn) { // function(song)
			this.song_loaded_fn = fn;
		},
		
		//
		// Querying
		//
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
		artists: function() {
			return _(this.db).chain()
				.keys()
				.sortBy(_.identity)
				.value();
		},
		artist_albums: function(artist_name) {
			return _(this.db[artist_name]).chain()
				.keys()
				.sortBy(_.identity)
				.value();
		},
		artist_album_songs: function(artist, album) {
			return _(this.db[artist][album]).chain()
				.map(function(attrs, track) {
					return Song({
						key: attrs.key,
						track: parseInt(track),
						title: attrs.title,
						artist: artist,
						album: album
					})
				})
				.sortBy(function(song) { return song.track })
				.value();
		},
		
		//
		// Modifying internal DB
		//
		add_song: function(opts) { // track, title, album, artist, key, tags
			if (!this.syncd) { // haven't grabbed the file
				var that = this;
				this.sync({
					update: false,
					callback: function() {
						return that.add_song(opts);
					}
				});
			} else { // we know we have a db
				// add the song to the songs_db
				if (!this.db[opts.artist])
					this.db[opts.artist] = {};
				
				if (!this.db[opts.artist][opts.album])
					this.db[opts.artist][opts.album] = {};
				db_album = this.db[opts.artist][opts.album];
				
				db_album[opts.track] = {title: opts.title, key: opts.key};
				
				// add the song's tags to the tag cloud
				var that = this;
				_(opts.tags).each(function(tag) {
					if (!that.tag_cloud[tag]) that.tag_cloud[tag] = [];
					
					that.tag_cloud[tag].push(opts.key);
				});
				
				// add to the meta structs
				this.add_key(opts);
				
				// callback if necessary
				if (opts.callback) {
					return {title: opts.title, album: opts.album, artist: opts.artist, key: opts.key}
				}
			}
		},
		
		//
		// Syncing and Updating with S3
		//
		sync: function(opts) { // update, callback()
			if (this.syncd) {
				save_db({
					db: this.db,
					tag_cloud: this.tag_cloud,
					callback: function() {
						that.dirty = false;
						if (callback) callback();
					}
				});
			} else {
				var that = this;
				get_db(function(db) {
					that.db = db;
					that.syncd = true;
					that.dirty = false;
					
					if (opts.update)
						that.update(opts.callback);
					else if (opts.callback)
						callback();
						
						
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
				
				if (keys_left != 0) {
					var new_songs = [];
					for(i=0; i < new_keys.length; i++) {
						var key = new_keys[i];
						// grab the tags
						(function(key, bucket_name) {
							
							var save_and_check = function(new_song) {
								new_songs.push(new_song);
								if (that.song_loaded_fn) {
									that.song_loaded_fn(Song(new_song));
								}
															
								// whether or not we added the song, decrement and check if we're the last
								keys_left -= 1;
								if (keys_left == 0) {
									var new_songs_length = new_songs.length;
									for (var j=0; j < new_songs_length; j++) {
										that.add_song(new_songs[j]); // we waited to put songs at this point 
																	 // so that calls don't step on each other
									}
									
									save_db({
										db: that.db,
										tag_cloud: that.tag_cloud,
										callback: function(saved_db){
											if (callback) callback();
										}
									});
									
								}
							}
							
							// get the ID3 tags
							ID3.loadTags(Utils.url(bucket_name, key), function() {
							    var tags = ID3.getAllTags(Utils.url(bucket_name, key));
								var new_song = {
									title: tags.title,
									artist: tags.artist,
									album: tags.album,
									track: parseInt(tags.track.split('/')[0]),
									key: key,
									tags: []
								};
								
								// get the genre tags
								lastfm.track.getTopTags({track: new_song.title, artist: new_song.artist, autocorrect: 1}, {
									success: function(data) {
										new_song.tags = _(data.toptags.tag).map(function(tag){ return tag.name });
										
										save_and_check(new_song);
									},
									error: function(code, message) {
										save_and_check(new_song);
									}
								})
								
							});
						})(key, that.bucket);
					}
				} else if (callback) {
					callback();
				}
			});
		}
	
	}
}