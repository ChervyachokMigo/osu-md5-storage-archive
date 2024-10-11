const fs = require('fs');
const md5File = require('md5-file');

const storage = require('./storage');

const { md5_storage_path } = require('./json').load('config.json', 'utf-8');

console.log(
	'MD5 storage path:', md5_storage_path, '\n',
    '\nAvailable commands:\n',
    'create | make | compress \n',
	'check | test | read_one\n'
);

const args = process.argv.slice(2);

//empty args
if (args.length === 0) {
    console.log('No command provided');
	process.exit();
}

storage.set_path('output');

if (args.find( v => v === 'make' || v === 'create' || v === 'compress')) {
	(async () => {
		const storage_data = storage.read(md5_storage_path);
		await storage.save(storage_data, 'output');
	})();
}

if (args.find( v => v === 'read_one' || v === 'test' || v === 'check' )){
	(async () => {
		const filename = '0c4c56f01318ed043312cb0f14787c54';
		const file = await storage.read_one(filename);
		console.log(file.data)
		fs.writeFileSync(filename, file.data);
		console.log(md5File.sync(filename));
	})();
}

if (args.find( v => v === 'check_all')) {
	(async () => {
		await storage.check_all(true);
	})();
}

