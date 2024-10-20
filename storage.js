const { readdirSync, existsSync, readFileSync, writeFileSync, createWriteStream, createReadStream, copyFileSync, mkdirSync, appendFileSync } = require('fs');

//const lzma = require("lzma");
const path = require('path');
const JSONbig = require('json-bigint');
const md5File = require('md5-file');
const crypto = require('crypto');
const { osu_db_load, beatmap_property, Gamemode } = require("osu-tools");

const cache = {
	filelist: null
}

const storage_path = {
	source: null,
	destination: null,
	osu: null
}

const block_size = 2000111000;

const check_folder = (foldername) => {
	if (!existsSync(foldername)) {
		mkdirSync(foldername);
	}
}

const _this = module.exports = {
	set_path: ({ source, destination, osu }) => {
		storage_path.source = source;
		storage_path.destination = destination;
		storage_path.osu = osu;
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
			const filelist = cache.filelist.map( v => v.name).concat(cache.filelist.map( v => v.name_deleted )); 
			return args.is_set ? new Set(filelist) : filelist;
		} else {
			return cache.filelist;
		}
	},

	load_all_data: async () => {
		console.log('Загрузка данных файлов');
		const chunk_size = Math.trunc(cache.filelist.length / 1000);
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
				gamemode: v.gamemode,
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
		console.log('Сжатый файл сохранен');
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

	get_info: () => {
		console.log('files count:', cache.filelist.length);
		let blocks_count = 0;
		cache.filelist.forEach( v => {
			if (v.block_num > blocks_count) 
				blocks_count = v.block_num;
		});
		console.log('blocks count:', blocks_count);
		let last_idx = 0;
		for (let block_num = 0; block_num <= blocks_count; block_num++) {
			console.log(`[Block ${block_num}]`);
			const block_files = cache.filelist.filter( v => v.block_num === block_num);
			last_idx += block_files.length;
			let start_idx = last_idx - block_files.length;
			console.log(`  Index range: ${start_idx}-${last_idx - 1}`);
			for (let gamemode of Object.values(Gamemode)) {
				if (typeof gamemode === 'string'){
					continue
				}
				const block_gamemode = block_files.filter( v => v.gamemode === gamemode);
				console.log(`  ${Gamemode[gamemode]} files: ${block_gamemode.length} `);
			}
			const deleted_files = cache.filelist.filter( v => v.name_deleted );
			console.log(`  Deleted files: ${deleted_files.length}`);
			console.log(`  Total files: ${block_files.length}`);
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

	add_one: (filepath, md5 = null) => {
		//checkexist
		if (!existsSync(filepath)) {
            console.error(`Файл '${filepath}' не найден.`);
			return false;
        }

		if (!md5) {
			md5 = path.basename(filepath).slice(0, 32);
		} 
		const name = md5;
		const data = readFileSync(filepath);
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
			_this.save_one(file);
			console.log(`[${last}] Добавлен новый файл: ${name}`);
        } else {
			cache.filelist[i].name = cache.filelist[i].name_deleted;
			delete cache.filelist[i].name_deleted;
            console.log(`[${i}] Восстановлен удаленный файл: ${name}`);
		}
		return true;
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
				console.error(`[${i}] Ошибка md5 для '${name}': ожидалось ${name}, получено ${md5}`);
			}
		}
		console.log(`Проверка завершена.`);
		return true;
	},

	check_after: async ({ percent, num }) => {     
		//create folders
		check_folder('errors');
		//check files, copy wrong to errors folder if md5 mismatch.
		console.log('проверка файлов...');
		let i = -1;
		const chunk_size = Math.trunc(cache.filelist.length / 100);
		const files = cache.filelist.map( v => v.name);
		const skipping_idx = num ? Number(num) : chunk_size * percent ;
		let first = true;
		for (let i = skipping_idx; i < files.length; i++) {
			if (first || i % chunk_size === 0) {
				const current_percent = Math.trunc((i / cache.filelist.length) * 100);
				console.log(`(${current_percent.toFixed(0)}%) Проверка ${i} из ${cache.filelist.length} файлов... `);
				first = false;
			}
			const file = await _this.read_one(files[i]);
			const md5 = crypto.createHash('md5').update(file.data).digest("hex");
			if (md5 !== files[i]) {
				writeFileSync(`errors/${files[i]}`, file.data);
				console.error(`[${i}] Ошибка md5 для '${files[i]}': ожидалось ${files[i]}, получено ${md5}`);
				break;
			}
		}
		console.log(`Проверка завершена.`);
		return true;
	},

	remove_after: (name) => {
		if (name.length !== 32) {
			console.error('Имя файла должно быть md5-хэшем.');
            return false;
		}

		const idx = _this.findIndex(name);

		if (idx === -1) {
			console.log(`Файл '${name}' не найден в списке.`);
			return false;
		}

		const deleted = cache.filelist.splice(idx, cache.filelist.length - idx);
		console.log(`Было удалено ${deleted.length} файлов`);

	},

	read_gamemode: async (i) => {
		if ( typeof cache.filelist[i].data === 'undefined' ) {
			cache.filelist[i].data = await _this.read_one_by_index(i);
		}

		let mode = null;
		
		const match = cache.filelist[i].data.toString().match( /mode:[ ]*([0-3])/i);
		if (match && match[1]){
			mode = parseInt(match[1]);
		} else {
			mode = 0;
		}
			
		if (mode === null) {
			mode = 0;
			console.error(`Не найдены данные gamemode для файла ${cache.filelist[i].name} в базе beatmaps.`);
		}
		return mode;
	},

	update_gamemode: async (beatmaps) => {
		const chunk_size = Math.trunc(cache.filelist.length / 100);
		console.time('chunk')
		for(let i = 0; i < cache.filelist.length; i++){
			//print progress
			if(i % chunk_size === 0) {
                console.log(`(${((i / cache.filelist.length) * 100).toFixed(0)}%) Обновление gamemode для ${i} из ${cache.filelist.length} файлов... `);
				console.timeEnd('chunk');
				console.time('chunk');
            }
            
            if(cache.filelist[i].name === null) {
				console.log(`Файл пропущен ${cache.filelist[i].name_deleted} потому что удален.`);
                continue;
            }

			if(typeof cache.filelist[i].gamemode !== 'undefined') {
				continue;
			}
			
			const idx = beatmaps.findIndex( v => {
				return v.beatmap_md5 === cache.filelist[i].name });
			if(idx === -1) {
				//console.log(`Не найдены данные gamemode для файла ${cache.filelist[i].name} в базе beatmaps.`);
				cache.filelist[i].gamemode = await _this.read_gamemode(i);
                continue;
            }
			cache.filelist[i].gamemode = beatmaps[idx].gamemode_int;
		}
	},

	sync_osu: async (local_storage_path = storage_path) => {

		const osu_db = osu_db_load(path.join(local_storage_path.osu, 'osu!.db'), [
			beatmap_property.folder_name,
			beatmap_property.osu_filename,
			beatmap_property.gamemode,
			beatmap_property.beatmap_md5
		]);

		await _this.update_gamemode(osu_db.beatmaps);
	},

	check_gamemode: () => {
		cache.filelist.forEach( (file, i) => {
			if (typeof file.gamemode === 'undefined'){
				console.log('gamemode undefined');
				return;
			}
			if(isNaN(Number(file.gamemode))){
				cache.filelist[i].gamemode = Gamemode[cache.filelist[i].gamemode];
			}
		});
	},

	update_storage: async (local_storage_path = storage_path) => {
		function difference ( beatmaps ) {
			const filelist = _this.get_filelist({ is_raw: true, is_set: true });
			return beatmaps.filter( x => filelist.has( x.beatmap_md5 ) === false );
		}

		const osu_db = osu_db_load(path.join(local_storage_path.osu, 'osu!.db'), [
			beatmap_property.folder_name,
			beatmap_property.osu_filename,
			beatmap_property.gamemode,
			beatmap_property.beatmap_md5
		]);

		const to_copy = difference(osu_db.beatmaps);
		console.log(`Обнаружено ${to_copy.length} несовпадающих md5`);
		let saved = 0;
		for (const file of to_copy){
			const res = _this.add_one(path.join(local_storage_path.osu, 'Songs', file.folder_name, file.osu_filename ), file.beatmap_md5 );
			if (res === false){
				console.error(`Ошибка добавления файла ${file.beatmap_md5}`);
                continue;
            }
			const last = cache.filelist.length - 1;
			cache.filelist[last].gamemode = await _this.read_gamemode(last);
			saved++;
		}
		if (saved > 0) {
			_this.save_filelist(local_storage_path);
			console.log(`Скопировано ${saved} файлов`);
		}
	},
}