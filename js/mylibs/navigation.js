Navigation = function(root) {
	return {
		root: root,
		
		artist_el: function(artist) {
			var li = $('<li>');
			var a = $('<a>', {'class': "artist"}).html(artist).data('artist', artist);
			var albums_ul = $('<ul>', {'class': 'songs'});
			var ul = $('<ul>');
			
			ul.albums = function() {return albums_ul};
			
			li.append(a);
			ul.append(li);
			ul.append(albums_ul);
			return ul;
		},
		album_el: function(album) {
			var li = $('<li>');
			var a = $('<a>', {'class': "album"}).html(album).data('album', album);
			var songs_ul = $('<ul>', {'class': 'songs'});
			var ul = $('<ul>');
			
			ul.songs = function() {return songs_ul};
			
			li.append(a);
			ul.append(li);
			ul.append(songs_ul);
			return ul;
		},
		song_el: function(song) {
			var li = $('<li>');
			var a = $('<a>', { 'class': "song", 'id': song.key}).html(song.track + '. ' + song.title);
			li.append(a);
			return li;			
		}
	}
}