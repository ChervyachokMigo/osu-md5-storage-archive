const { existsSync, mkdirSync } = require('fs')


module.exports = {
	check_folder: (folder_path) => {
		if (!existsSync(folder_path)) {
			mkdirSync(folder_path);
		}
	},

	log: (...text) => {
		console.log(...text, '                                        ');
	}
}