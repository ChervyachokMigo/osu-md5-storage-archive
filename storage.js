const { readdirSync, existsSync, readFileSync, writeFileSync, createWriteStream, createReadStream, copyFileSync, mkdirSync } = require('fs');

//const lzma = require("lzma");
const path = require('path');
const JSONbig = require('json-bigint');
const md5File = require('md5-file');

const cache = {
	filelist: null
}

const storage_path = {
	source: null,
	json: null,
	raw: null
}

const check_folder = (foldername) => {
	if (!existsSync(foldername)) {
		mkdirSync(foldername);
	}
}

const _this = module.exports = {
	set_path: ({ source, destination }) => {
		storage_path.source = source;
		storage_path.json = destination + '.json';
		storage_path.raw = destination + '.raw';
	},

	compress_files: async () => {
		if (!existsSync(storage_path.source)){
			throw new Error(`The specified folder '${storage_path.source}' does not exist.`)
		}

		cache.filelist = [];
        console.log('чтение файлов');
		const files = readdirSync(storage_path.source, { encoding: 'utf8' });

		const chunk_size = Math.trunc(files.length / 10 );
		for (let i = 0; i < files.length; i++){
			if ( i % chunk_size === 0 ) {
				console.log(`(${((i / files.length) * 100).toFixed(0)}%) Processing ${i + 1} of ${files.length} files... `);
			}			
			const filename = files[i];
			const filepath = path.join(storage_path.source, filename);
			const data = readFileSync(filepath);
            cache.filelist.push({ 
				name: filename.slice(0, 32),
				data,
			});
        };

		_this.update_offsets();

		await _this.save_all_data();
	},

	load_filelist: () => {
		const result = JSONbig.parse(readFileSync(storage_path.json, { encoding: 'utf8' }));
        cache.filelist = result;
	},

	get_filelist: (args = { is_raw: false, is_set: false }) => {
		if (typeof args.is_raw === 'undefined'){
			args.is_raw = false;
		}
		if (typeof args.is_set === 'undefined'){
            args.is_set = false;
        }
		if (!cache.filelist) {
            _this.load_filelist();
        }
		if (args.is_raw) {
			const filelist = cache.filelist.map( v => v.name); 
			return args.is_set ? new Set(filelist) : filelist;
		} else {
			return cache.filelist;
		}
	},

	cache_add_data: (name, data) => {
		const i = cache.filelist.findIndex( v => v.name === name );
		if (i === -1) {
            throw new Error(`The specified file '${name}' does not exist in the list.`);
        }
		cache.filelist[i].data = data;
	},

	load_all_data: async () => {
		if (!cache.filelist) {
            _this.load_filelist();
        }
		const chunk_size = Math.trunc(cache.filelist.length / 100);
		for (let i = 0; i < cache.filelist.length; i++) {
			if (i % chunk_size === 0) {
                console.log(`(${((i / cache.filelist.length) * 100).toFixed(0)}%) Processing ${i + 1} of ${cache.filelist.length} files... `);
            }
            cache.filelist[i].data = await _this.read_one_by_index(i);
		}
	},

	save_all_data: async (output = storage_path) => {
		console.log('сохранение списка файлов в json');
        writeFileSync(output.json, JSONbig.stringify(
			cache.filelist.map( v => ({ 
				name: v.name, 
				offset: v.offset, 
				size: v.size }))
		), { encoding: 'utf8' });

		console.log('сохранение сжатого файла');
		return await new Promise( (res, rej) => {
			const writer = createWriteStream(output.raw, {autoClose: true, flush: true });
	
			for (let {data} of cache.filelist) {
				writer.write(data, (err) => {
					if (err) {
						console.error('Ошибка при записи файла:', err);
						rej(err);
					}
				});
			}

			writer.on('close', () => {
				console.log('сохранение завершено');
				res(true);
			});
		});
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

	findIndex: (name) => {
		if (!cache.filelist) {
			_this.load_filelist();
		}
		const result = cache.filelist.findIndex(file => file.name === name);
		if (result === -1) {
            throw new Error(`The specified file '${name}' does not exist in the list.`);
        }
		return result;
	},

	update_offsets: () => {
		let last_offset = 0;
		for( let i = 0; i < cache.filelist.length; i++ ) {
			cache.filelist[i].offset = last_offset;
			cache.filelist[i].size = cache.filelist[i].data.length;
			last_offset += cache.filelist[i].data.length;
		} 
	},

	read_one_by_index: async (i) => {
		return await new Promise( (res, rej) => {
			const stream = createReadStream( storage_path.raw, { 					
				start: cache.filelist[i].offset, 
				end: cache.filelist[i].offset + cache.filelist[i].size - 1  
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
		
	},

	read_one: async (name) => {

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

	remove_one: (name) => {
		const i = _this.findIndex(name);
		cache.filelist.splice(i, 1);
	},

	check_all: async (skip_checked = false) => {     
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
			}
		}
	}
}