const { default: axios } = require("axios");
const crypto = require('crypto');
const path = require("path");

const cache = {
	api_key: null
}

module.exports = {
	set_api_key: (key) => cache.api_key = key,

	request_beatmap: async ( md5 ) => {

		if (!cache.api_key) {
			console.error( 'Error: First set an API key using set_api_key(key)' );
			return null;
		}

		const url = `https://osu.ppy.sh/api/get_beatmaps?k=${cache.api_key}&h=${md5}&limit=1`;
		const res = await axios.get( url );
        
		if ( res.data && res.data.length > 0 ) {
			return res.data.shift();
		}

		console.error( 'no beatmap info on bancho by md5', md5 );
		return null;
	},

	download_beatmap: async ({ beatmap_id, md5, is_save_file, output_path, is_md5_check }) => {
		if (typeof is_md5_check === 'undefined') {
			is_md5_check = true;
		}

		if (typeof is_save_file === 'undefined') {
            is_save_file = true;
        }

		if (is_save_file && !output_path){
			throw new Error('[download_beatmap] Error: need set beatmap output_path\n');
		}

		if (is_md5_check && !md5){
            throw new Error('[download_beatmap] Error: need set md5\n');
        }

		const url = `https://osu.ppy.sh/osu/${beatmap_id}`;
			
		return new Promise( res => {
			axios.get( url ).then( async (response) => {
				if (response.data) {
					const data = response.data;
					const downloaded_md5 = crypto.createHash('md5').update(data).digest("hex");

					if (is_save_file) {
						writeFileSync( path.join( output_path, `${downloaded_md5}.osu` ), data);
					}

					if (is_md5_check && downloaded_md5 === md5 || !is_md5_check){
						res({ data, error: null });
					} else {
						res({ data: null, error: 'beatmap md5 not valid' });
					}
				} else {
					res({ data: null, error: 'no response from bancho' });
				}
			}).catch( err => {
				res({ data: null, error: err.toString() });
			});
		});
	}
}