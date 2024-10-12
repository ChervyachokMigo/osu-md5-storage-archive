const fs = require('fs');
const md5File = require('md5-file');

const storage = require('./storage');
const path = require('path');

console.log(
    'Available commands:\n',
    'create | make | compress \n',
	'check | test | read_one\n'
);

const args = process.argv.slice(2);

//empty args
if (args.length === 0) {
    console.log('No command provided');
	process.exit();
}

storage.set_path({ 
	source: path.join('D:', 'osu_md5_storage'),
	destination: 'test'
});

if (args.find( v => v === 'make' || v === 'create' || v === 'compress')) {
	(async () => {
		await storage.compress_files();
	})();
}

if (args.find( v => v === 'read_one' || v === 'test' || v === 'check' )){
	(async () => {
		const filename = '0c4c56f01318ed043312cb0f14787c54';
		const file = await storage.read_one(filename);
		fs.writeFileSync(filename, file.data);
		console.log(filename, '->', md5File.sync(filename));
	})();
}

if (args.find( v => v === 'check_all')) {
	(async () => {
		await storage.check_all(true);
	})();
}

if (args.find( v => v === 'get_list')) {
	const list = storage.get_filelist({is_raw: true, is_set: true});
}

if (args.find( v => v === 'load_save_check' )) {
	(async () => {
		await storage.load_all_data();
		await storage.save_all_data({ raw: 'test.raw', json: 'test.json'});
	})();
}

if (args.find( v => v === 'remove_one' )) {
	(async () => {
		const filename = '0c4c56f01318ed043312cb0f14787c54';
		await storage.load_all_data();
		await storage.remove_one(filename);
		await storage.save_all_data({ raw: 'test.raw', json: 'test.json'});
		const file = await storage.read_one(filename);
	})();
}