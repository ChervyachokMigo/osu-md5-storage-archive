const { readFileSync, existsSync } = require('fs');

module.exports = {
	load: (filepath, encoding) => {
		if (existsSync(filepath)) {
			return JSON.parse(readFileSync(filepath, { encoding }));
		}
		throw new Error(filepath + ' is not exists');
	}
}