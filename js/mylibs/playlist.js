Playlist = function(the_songs) {
	var songs = the_songs;
	var index = 0;
	
	return {
		songs: function() {
			return songs;
		},
		current: function() {
			return songs[index];
		},
		next: function() {
			index += 1;
			return this.current();
		}
	}
}