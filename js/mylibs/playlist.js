Playlist = function(the_songs) {
	var songs = the_songs;
	var index = 0;
	var changed_func = null;
	
	return {
		changed: function(func) { //function(songs, index)
			changed_func = func;
		},
		songs: function() {
			return songs;
		},
		replace_with: function(new_songs) {
			index = 0;
			songs = new_songs;
			changed_func(songs, index);
		},
		current: function() {
			return songs[index];
		},
		next: function() {
			index += 1;
			changed_func(songs, index);
			return this.current();
		}
	}
}