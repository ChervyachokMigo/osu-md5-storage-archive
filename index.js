const beatmaps = require("./beatmaps");
const misc = require("./misc");
const requests = require("./requests");
const storage = require("./storage");

module.exports = {
	...misc,
	...requests,
	...beatmaps,
	...storage
};