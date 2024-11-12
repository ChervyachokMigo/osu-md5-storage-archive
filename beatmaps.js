const path = require("path")

const { check_folder } = require("./misc");
const { existsSync, readFileSync, writeFileSync } = require("fs");
const { request_beatmap, download_beatmap } = require("./requests");

const ignore_list_path = path.join('data', 'ignore_list.json');

let ignore_list = [];

const _this = module.exports = {
	find_ignore: (md5) => ignore_list.indexOf(md5) > -1,
	get_ignore_list: () => ignore_list,
	save_ignore_list: () => writeFileSync( ignore_list_path, JSON.stringify(ignore_list), { encoding: 'utf8' }),
	init_ignore_list: () => {
		check_folder('data');

		if (existsSync(ignore_list_path)) {
			ignore_list = JSON.parse( readFileSync( ignore_list_path, { encoding: 'utf8' }));
			console.log(`Ignore list loaded: ${ignore_list.length} entries`);
		} else {
			console.log('Ignore list not found. Creating new one...');
            _this.save_ignore_list();
		}
	},

	add_ignore: (md5) => {
		if (!md5) {
			console.error('MD5 hash is required');
            return false;
		}
		if (!ignore_list.includes(md5)) {
            ignore_list.push(md5);
            _this.save_ignore_list();
            console.log(`[${md5}] Added to ignore list`);
        } else {
            console.log(`[${md5}] already in ignore list`);
        }
	},

	get_beatmap: async (md5) => {
		if (!md5) {
            return false;
        }

		if (ignore_list.includes(md5)) {
			console.log(`[${md5}] Skipping due to being in ignore list`);
            return false;
		}

		const beatmap = await request_beatmap(md5);

		if (!beatmap) {
			console.log(`[${md5}] Beatmap not found`);
			_this.add_ignore(md5);
            return false;
		}

		const { beatmap_id, file_md5 } = beatmap;
		const { data, error } = await download_beatmap({ 
			beatmap_id, 
			md5: file_md5, 
			is_save_file: false, 
			is_md5_check: true 
		});

		if (error) {
			console.error(`[${md5}] Error downloading beatmap:`, error);
            _this.add_ignore(md5);
            return false;
		}

		if (data) {
			console.log(`[${md5}] Beatmap downloaded`);
            return data;
		}
	}
}