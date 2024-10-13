const { readdirSync, existsSync, readFileSync, writeFileSync, createWriteStream, createReadStream, copyFileSync, mkdirSync, appendFileSync } = require('fs');

//const lzma = require("lzma");
const path = require('path');
const JSONbig = require('json-bigint');
const md5File = require('md5-file');
const crypto = require('crypto');

const cache = {
	filelist: null
}

const storage_path = {
	source: null,
	destination: null
}

const block_size = 2000111000;

const check_folder = (foldername) => {
	if (!existsSync(foldername)) {
		mkdirSync(foldername);
	}
}

const _this = module.exports = {
	set_path: ({ source, destination }) => {
		storage_path.source = source;
		storage_path.destination = destination;
	},

	prepare: (local_storage_path = storage_path) => {
		if (!cache.filelist) {
            _this.load_filelist(local_storage_path);
        }
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

	load_filelist: (local_storage_path = storage_path) => {
		const result = JSONbig.parse(readFileSync(local_storage_path.destination + '.json', { encoding: 'utf8' }));
        cache.filelist = result;
	},

	get_filelist: (args = { is_raw: false, is_set: false }) => {
		if (typeof args.is_raw === 'undefined'){
			args.is_raw = false;
		}
		if (typeof args.is_set === 'undefined'){
            args.is_set = false;
        }
		if (args.is_raw) {
			const filelist = cache.filelist.map( v => v.name); 
			return args.is_set ? new Set(filelist) : filelist;
		} else {
			return cache.filelist;
		}
	},

	load_all_data: async () => {
		const chunk_size = Math.trunc(cache.filelist.length / 100);
		for (let i = 0; i < cache.filelist.length; i++) {
			if (i % chunk_size === 0) {
                console.log(`(${((i / cache.filelist.length) * 100).toFixed(0)}%) Processing ${i + 1} of ${cache.filelist.length} files... `);
            }
            cache.filelist[i].data = await _this.read_one_by_index(i);
		}
	},

	save_filelist: (local_storage_path = storage_path) => {
		console.log('сохранение списка файлов', local_storage_path.destination + '.json');
        writeFileSync(local_storage_path.destination + '.json', 
			JSONbig.stringify(cache.filelist.map( v => ({
				name: v.name,
				block_num: v.block_num,
				offset: v.offset,
                size: v.size,
                name_deleted: v.name_deleted
			}))), { encoding: 'utf8' });
	},

	save_one: (file, local_storage_path = storage_path) => {
		appendFileSync( `${local_storage_path.destination}_${file.block_num}.raw`, file.data );
	},

	save_block: (block, local_storage_path = storage_path) => {
		console.log(`Сохранение блока ${local_storage_path.destination}_${block.num}.raw`);
		writeFileSync(local_storage_path.destination + '_' + block.num + '.raw', Buffer.concat(block.data) );
	},

	save_all_data: async (local_storage_path = storage_path) => {
		_this.save_filelist(local_storage_path);

		console.log('сохранение сжатого файла');

        const current_block = {
			num: 0,
			data: []
		};

		for (let {data, block_num} of cache.filelist) {
			if (current_block.num === block_num) {
				current_block.data.push(data);
                continue;
			} else {
				//if block more than block limit size
				_this.save_block(current_block, local_storage_path);
                current_block.num = block_num;
                current_block.data = [data];
			}
		}
		_this.save_block(current_block, local_storage_path);
	},

	find: (name) => {
		const result = cache.filelist.find(file => file.name === name);
		if (!result) {
            throw new Error(`The specified file '${name}' does not exist in the list.`);
        }
		return result;
	},

	findIndex: (name) => {
		return cache.filelist.findIndex(file => file.name === name);
	},

	update_offsets: () => {
		let last_offset = 0;
		let block_num = 0;
		for( let i = 0; i < cache.filelist.length; i++ ) {
			cache.filelist[i].block_num = block_num;
			cache.filelist[i].offset = last_offset;
			cache.filelist[i].size = cache.filelist[i].data.length;
			//next block prepare offset
			last_offset += cache.filelist[i].data.length;
			if (last_offset > block_size) {
				last_offset = 0;
				block_num++;
			}
		} 
	},

	read_one_by_index: async (i) => {
		return await new Promise( (res, rej) => {
			const stream = createReadStream( storage_path.destination + '_' + cache.filelist[i].block_num + '.raw', { 					
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
		name = name.slice(0, 32);
        const file = _this.find(name);
        
        //console.log('чтение файла');
		const data = await new Promise( (res, rej) => {
				const stream = createReadStream( storage_path.destination + '_' + file.block_num + '.raw', {
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
		return { ...file, data }
	},

	remove_one: (name) => {
		name = name.slice(0, 32);
		const i = _this.findIndex(name);
		if (i > -1) {
			cache.filelist[i].name_deleted = cache.filelist[i].name;
			cache.filelist[i].name = null;
			console.log(`Удален файл: ${name}`);
        } else {
			console.log(`Файл '${name}' не найден в списке.`);
		}
	},

	add_one: async (filepath) => {
		const data = readFileSync(filepath);
		const name = path.basename(filepath).slice(0, 32);
		const i = cache.filelist.findIndex( v => v.name_deleted === name);
		if (i === -1) {
			const last = cache.filelist.length - 1;
			let last_offset = cache.filelist[last].offset;
			let last_size = cache.filelist[last].size;
			let block_num = cache.filelist[last].block_num;
            let offset = last_offset + last_size;
			let size = data.length;
			if (offset > block_size) {
				offset = 0;
				block_num++;
			}
			const file = { name, block_num, offset, size, data };
            cache.filelist.push(file);
			await _this.save_one(file);
			console.log(`Добавлен новый файл: ${name}`);
        } else {
			delete cache.filelist[i].name_deleted;
            cache.filelist[i].name = name;
            console.log(`Восстановлен удаленный файл: ${name}`);
		}
		
	},

	check_all: async () => {     
		//create folders
		check_folder('errors');
		//check files, copy wrong to errors folder if md5 mismatch.
		console.log('проверка всех файлов...');
		let i = 0;
		const chunk_size = Math.trunc(cache.filelist.length / 100);
		for (let name of cache.filelist.map( v => v.name)) {
			if (i++ % chunk_size === 0) {
                console.log(`(${((i / cache.filelist.length) * 100).toFixed(0)}%) Проверка ${i} из ${cache.filelist.length} файлов... `);
            }
			const file = await _this.read_one(name);
			const md5 = crypto.createHash('md5').update(file.data).digest("hex");
			if (md5 !== name) {
				writeFileSync(`errors/${name}`, file.data);
				console.error(`Ошибка md5 для '${name}': ожидалось ${name}, получено ${md5}`);
			}
		}
	}
}