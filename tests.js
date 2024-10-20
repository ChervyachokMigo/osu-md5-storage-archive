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
	destination: path.join('D:', 'osu_md5_storage'),
	osu: path.join('D:', 'osu!')
});

if (args.find( v => v === 'make' || v === 'create' || v === 'compress')) {
	(async () => {
		await storage.compress_files();
	})();
}

if (args.find( v => v === 'get_list')) {
	storage.prepare();
	const list = storage.get_filelist({is_raw: true, is_set: true});
	console.log(list);
}

if (args.find( v => v === 'load_save_check' )) {
	(async () => {
		storage.prepare();
		await storage.load_all_data();
		await storage.save_all_data({ destination: 'test' });
	})();
}

if (args.find( v => v === 'read_one' || v === 'test' || v === 'check' )){
	(async () => {
		//const filename = 'fffffe34362eaf3985c1e2a450f512aa'; 
		//const filename = '0c4c56f01318ed043312cb0f14787c54';
		const filename = '65f71d98ee538a91cac3f2d406e02018';
		storage.prepare({destination: 'test'});
		const file = await storage.read_one(filename);
		fs.writeFileSync(filename, file.data);
		console.log(filename, '->', md5File.sync(filename));
	})();
}

if (args.find( v => v === 'check_all')) {
	storage.prepare();
	(async () => {
		await storage.check_all();
	})();
}

//4c0a263438eb9b491b803cd8575eb777
//ae79e66d56af81baab21d2f5dc5410a6

if (args.find( v => v === 'check_after')) {
	storage.prepare();
	(async () => {
		await storage.check_after({ num: 230000 });
	})();
}

if (args.find( v => v === 'remove_after')) {
	storage.prepare();
	(async () => {
		await storage.load_all_data();
		storage.remove_after('ae79e66d56af81baab21d2f5dc5410a6');
		await storage.save_all_data();
	})();
}

if (args.find( v => v === 'remove_one' )) {
	(async () => {
		const filename = '0c4c56f01318ed043312cb0f14787c54';
		const test_output = { destination: 'test' };
		storage.prepare();
		await storage.load_all_data();
		storage.remove_one(filename);
		storage.save_filelist(test_output);
		//await storage.save_all_data(test_output);
		const file = await storage.read_one(filename);
	})();
}

if (args.find( v => v === 'add_one' )) {
	(async () => {
		const filename = '65f71d98ee538a91cac3f2d406e02018.osu';
		const test_output = { destination: 'test' };
		storage.prepare(test_output);
		await storage.load_all_data();
		storage.remove_one(filename);
		storage.add_one(filename);
		storage.save_filelist(test_output);
		//await storage.save_all_data(test_output);
		const file = await storage.read_one(filename);
		delete file.data;
		console.log(file);
	})();
}

if (args.find( v => v === 'sync_osu' )) {
	(async () => {
		storage.prepare();
		await storage.load_all_data();
		await storage.sync_osu();
		storage.save_filelist();
	})();
}

if (args.find( v => v === 'get_info' )) {
	(async () => {
		storage.prepare();
		storage.get_info();
	})();
}

if (args.find( v => v === 'check_gamemode' )) {
	(async () => {
		storage.prepare();
		storage.check_gamemode();
		storage.save_filelist();
	})();
}

if (args.find( v => v === 'md5_compare' )) {
	(async () => {
		storage.prepare();
		await storage.update_storage();

	})();
}