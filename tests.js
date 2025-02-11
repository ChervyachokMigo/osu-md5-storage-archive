const fs = require('fs');
const md5File = require('md5-file');

const storage = require('./storage');
const path = require('path');
const { set_api_key } = require('./requests');

const args = process.argv.slice(2);

//empty args
if (args.length === 0) {
    console.log('No command provided');
	process.exit();
}

storage.set_path({ 
	source: path.join('D:', 'osu_md5_storage'),
	destination: path.join('D:', 'osu_md5_storage'),
	osu: path.join('D:', 'osu!'),
	laser_files: path.join('D:', 'osu!laser', 'files')
});

if (args.find( v => v === 'make' || v === 'create' || v === 'compress')) {
	(async () => {
		storage.prepare();
		const new_files = await storage.compress_files();
		await storage.check_files_by_list(new_files);
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
		storage.save_all_data(0, { destination: 'test' });
	})();
}

if (args.find( v => v === 'read_one' || v === 'test' || v === 'check' )){
	(async () => {
		if (!args[1]){
			console.log('No md5 provided for remove_after');
            return;
		}
		//const filename = 'fffffe34362eaf3985c1e2a450f512aa'; 
		//const filename = '0c4c56f01318ed043312cb0f14787c54';
		//const filename = '65f71d98ee538a91cac3f2d406e02018';
		storage.prepare();
		try {
			const file = await storage.read_one(args[1]);
			fs.writeFileSync(args[1], file.data);
			console.log(args[1], '->', md5File.sync(args[1]));
		} catch(e) {
			log(`Ошибка при загрузке файла: ${args[1]}`);
			process.exit()
		}
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
		//await storage.check_after({ num: 240446 });
		await storage.check_after({ num: 184181 });
	})();
}

if (args.find( v => v === 'remove_after')) {
	storage.prepare();
	(async () => {
		//check md5 of file in command line
		if (!args[1]){
			console.log('No md5 provided for remove_after');
            return;
		}
		await storage.load_all_data();
		const start_block = storage.remove_after(args[1]);
		if (start_block !== false) {
			storage.save_all_data(start_block);
		}
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
		//storage.save_all_data(0, test_output);
		try{
			const file = await storage.read_one(filename);
		} catch(e) {
			log(`Ошибка при загрузке файла: ${filename}`);
			process.exit()
		}
	})();
}

if (args.find( v => v === 'add_one' )) {
	(async () => {
		const filename = '65f71d98ee538a91cac3f2d406e02018.osu';
		const test_output = { destination: 'test' };
		storage.prepare(test_output);
		await storage.load_all_data();
		storage.remove_one(filename);
		await storage.add_one({ filepath: filename });
		storage.save_filelist(test_output);
		//storage.save_all_data(0, test_output);
		try{
			const file = await storage.read_one(filename);
			delete file.data;
			console.log(file);
		} catch(e) {
			log(`Ошибка при загрузке файла: ${filename}`);
			process.exit()
		}
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

if (args.find( v => v === 'update_storage' )) {
	(async () => {
		if (!process.env.api_key){
			console.log('Error: No API key provided.');
            process.exit();
		}
		
		set_api_key(process.env.api_key)

		storage.prepare();
		const new_files = await storage.update_storage();
		await storage.check_files_by_list(new_files);
	})();
}

if (args.find( v => v === 'update_storage_from_realm' )) {
	(async () => {
		if (!process.env.api_key){
			console.log('Error: No API key provided.');
            process.exit();
		}
		
		set_api_key(process.env.api_key)

		storage.prepare();
		storage.laser.init_realm(path.join('D:', 'osu!laser', 'client.realm'));
		const new_files = await storage.laser.update_storage_from_realm();
		await storage.check_files_by_list(new_files);
	})();
}