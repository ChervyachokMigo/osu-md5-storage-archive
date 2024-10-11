const { readdirSync, existsSync, readFileSync, writeFileSync, createWriteStream, createReadStream, copyFileSync, mkdirSync } = require('fs');

//const lzma = require("lzma");
const path = require('path');
const JSONbig = require('json-bigint');
const md5File = require('md5-file');

const cache = {
	filelist: null
}

const storage_path = {
	json: null,
	raw: null
}

const check_folder = (foldername) => {
	if (!existsSync(foldername)) {
		mkdirSync(foldername);
	}
}

const _this = module.exports = {
	set_path: (destination) => {
		storage_path.json = destination + '.json';
		storage_path.raw = destination + '.raw';
	},

	check_path: () => {
		if (!existsSync(storage_path.json) || !existsSync(storage_path.raw)) {
            throw new Error(`The specified storage paths '${storage_path.json}' and '${storage_path.raw}' do not exist.`);
        }
	},

	read: (folderpath) => {
		if (!existsSync(folderpath)){
			throw new Error(`The specified folder '${folderpath}' does not exist.`)
		}

		const result = [];
        console.log('чтение файлов');
		const files = readdirSync(folderpath, { encoding: 'utf8' });

		const chunk_size = Math.trunc(files.length / 10 );
		for (let i = 0; i < files.length; i++){
			if ( i % chunk_size === 0 ) {
				console.log(`(${((i / files.length) * 100).toFixed(0)}%) Processing ${i + 1} of ${files.length} files... `);
			}
			// if (files[i].slice(0, 32) !== '0c4c56f01318ed043312cb0f14787c54') {
			// 	continue;
			// }
			
			const filename = files[i];
			const filepath = path.join(folderpath, filename);
			const data = readFileSync(filepath);
            result.push({ 
				name: filename.slice(0, 32),
				data,
			});
			// if ( filename.slice(0, 32) === '0c4c56f01318ed043312cb0f14787c54'){
			// 	writeFileSync(filename, data);
			// 	console.log(md5File.sync(filename));
			// 	//console.log(data.toString('utf8'));
			// 	process.exit();
			// }
        };
		return result;
	},

	load_filelist: () => {
		_this.check_path();
		const result = JSONbig.parse(readFileSync(storage_path.json, { encoding: 'utf8' }));
        cache.filelist = result;
	},

	find: (name) => {
		if (!cache.filelist) {
			_this.load_filelist();
		}
		const result = cache.filelist.find(file => file.name === name);
		if (!result) {
            throw new Error(`The specified file '${name}' does not exist in the list.`);
        }
		return result;

	},

	save: async (files) => {
		_this.check_path();

		let last_offset = 0;
		let last_size = 0;

		console.log('создание списка файлов');
        const files_list = files.map(({ name, data }) => {
			last_size = data.length;
			const res = {
				name,
				offset: last_offset,
				size: last_size
			}
			last_offset += last_size;
			return res;
		});
		
		console.log('сохранение списка файлов в json');
        writeFileSync(storage_path.json, JSONbig.stringify(files_list), { encoding: 'utf8' });

		console.log('сохранение сжатого файла');
		
		return await new Promise( (res, rej) => {
			const writer = createWriteStream(storage_path.raw, {autoClose: true, flush: true });
	
			for (let file of files) {
				writer.write(file.data, (err) => {
					if (err) {
						console.error('Ошибка при записи файла:', err);
						throw err;
						rej(err);
					}
					res(true);
				});
			}
			writer.on('close', () => {
				console.log('сжатие завершено');
			});
		});

	},

	read_one: async (name) => {
		_this.check_path();

        const file = _this.find(name);
        
        //console.log('чтение файла');
		const data = await new Promise( (res, rej) => {
				const stream = createReadStream( storage_path.raw, {
					start: file.offset, 
					end: file.offset + file.size -1 
				});

				let result = null;

				stream.on('error', err => {
					console.log('Ошибка чтения:', err);
					throw err;
				});

				stream.on('data', chunk => {
					if (!result) {
						result = chunk;
					} else {
						result = Buffer.concat([ result, chunk ]);
					}
				});

				stream.on('end', () => {
					res(result);
				});
			});
		return { name, data, offset: file.offset, size: file.size }
	},

	check_all: async (skip_checked = false) => {
		_this.check_path();        
		_this.load_filelist();
		//create folders
		check_folder('test');
		check_folder('errors');
		//check files, copy wrong to errors folder if md5 mismatch.
		console.log('проверка всех файлов...');
		const checked = new Set(readdirSync('test'));
		let checked_go = true;
		for (let name of cache.filelist.map( v => v.name)) {
			if (checked_go && skip_checked && checked.has(name)) {
                continue;
            }
			checked_go = false;
			const file = await _this.read_one(name);
			const output_filepath = `test/${name}`;
			writeFileSync(output_filepath, file.data);
			const md5 = md5File.sync(output_filepath);
			if (md5 !== name) {
				copyFileSync(output_filepath, `errors/${name}`);
				console.error(`Ошибка md5 для '${name}': ожидалось ${name}, получено ${md5}`);
                //throw new Error(`Ошибка md5 для '${name}'`);
			}
		}
	}
}