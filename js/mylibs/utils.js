// requires S3Ajax.js
Utils = {
	url: function(bucket, key) {
		return S3Ajax.URL + '/' + escape(bucket + '/' + key);
	},
	
	initS3: function(key, secret) {
		S3Ajax.KEY_ID = key;
		S3Ajax.SECRET_KEY = secret;
	},
	
	numsort: function(i, j) {
		return i - j;
	}	
}