const { readdirSync, existsSync, readFileSync, writeFileSync, createReadStream, appendFileSync } = require('fs');

//const lzma = require("lzma");
const path = require('path');
//const JSONbig = require('json-bigint');
const crypto = require('crypto');
const { osu_db_load, beatmap_property, Gamemode } = require("osu-tools");
const { check_folder, log } = require('./misc');
const { init_ignore_list, find_ignore, get_beatmap, add_ignore } = require('./beatmaps');

const cache = {
	filelist: []
}

const storage_path = {
	source: null,
	destination: null,
	osu: null
}

const block_size = 2000111000;

const _this = module.exports = {
	set_path: ({ source, destination, osu }) => {
		storage_path.source = source;
		storage_path.destination = destination;
		storage_path.osu = osu;
	},

	prepare: (local_storage_path = storage_path) => {
		init_ignore_list();
        _this.load_filelist(local_storage_path);
	},

	compress_files: async () => {
		if (!existsSync(storage_path.source)){
			throw new Error(`The specified folder '${storage_path.source}' does not exist.`)
		}

        log('чтение файлов');
		const files = readdirSync(storage_path.source, { encoding: 'utf8' });
		const chunk_size = Math.trunc(files.length / 100 );

		const files_set = new Set(cache.filelist.map( v => v.name ));

		const new_files_idx = [];

		for (let i = 0; i < files.length; i++){
			if ( i % chunk_size === 0 ) {
				const text = `(${((i / files.length) * 100).toFixed(0)}%) Processing ${i + 1} of ${files.length} files... `;
				process.stdout.write( text +'\r');
			}
			
			const md5 = files[i].slice(0, 32);

			if (md5){
				continue;
			}

			if (files_set.has(md5)) {
                continue;
            }

			if (find_ignore(md5)) {
				continue;
			}

			const filepath = path.join(storage_path.source, files[i]);

			const idx = await _this.add_one({ filepath, md5 });

			if (idx === false){
				add_ignore(md5);
                continue;
            }

			cache.filelist[idx].gamemode = await _this.read_gamemode(idx);
			new_files_idx.push(idx);
        };

		_this.save_filelist();

		return new_files_idx;
	},

	load_filelist: (local_storage_path = storage_path) => {
		const filelist_path = local_storage_path.destination + '.json';
		if (!existsSync(filelist_path)) {
            log('Список файлов не найден, создание нового...');
            _this.save_filelist(local_storage_path);
            return;
        }
        cache.filelist = JSON.parse( readFileSync(filelist_path, { encoding: 'utf8' }));
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
		log('Загрузка данных файлов');
		const chunk_size = Math.trunc(cache.filelist.length / 100);
		for (let i = 0; i < cache.filelist.length; i++) {
			if (i % chunk_size === 0) {
				const text = `(${((i / cache.filelist.length) * 100).toFixed(0)}%) Processing ${i + 1} of ${cache.filelist.length} files... `;
				process.stdout.write( text +'\r');
            }
			try{
				cache.filelist[i].data = await _this.read_one_by_index(i);
			} catch(e) {
				log(`[${i}] Ошибка при загрузке файла: ${cache.filelist[i].name}`);
			}
		}
	},

	save_filelist: (local_storage_path = storage_path) => {
		const filelist_path = local_storage_path.destination + '.json';
		log('сохранение списка файлов', filelist_path);
        writeFileSync(filelist_path, 
			JSON.stringify(cache.filelist.map( v => ({
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
		const block_filepath = local_storage_path.destination + '_' + block.num + '.raw';
		log(`[${block.num}] Сохранение блока ${block_filepath}`);
		writeFileSync(block_filepath, Buffer.concat(block.data) );
	},

	save_all_data: (start_block = 0, local_storage_path = storage_path) => {
		_this.save_filelist(local_storage_path);

		log('сохранение сжатого файла');

        const current_block = {
			num: 0,
			data: []
		};

		let is_started = false;

		for (let {data, block_num} of cache.filelist) {

			//start from start_block num
			if (!is_started) {
				if (start_block < block_num) {
					continue;
				} else {
					current_block.num = block_num;
					is_started = true;
					log('начато сохранение с', current_block.num, 'блока');
				}
			}

			//data filling
			if (current_block.num === block_num) {
				current_block.data.push(data);
                continue;
			//saving data
			} else {
				_this.save_block(current_block, local_storage_path);
                current_block.num = block_num;
                current_block.data = [data];
			}
		}
		
		//save last block
		_this.save_block(current_block, local_storage_path);
		
		log('Сжатый файл сохранен');
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

	// update_offsets: () => {
	// 	let last_offset = 0;
	// 	let block_num = 0;
	// 	for( let i = 0; i < cache.filelist.length; i++ ) {
	// 		cache.filelist[i].block_num = block_num;
	// 		cache.filelist[i].offset = last_offset;
	// 		cache.filelist[i].size = cache.filelist[i].data.length;
	// 		//next block prepare offset
	// 		last_offset += cache.filelist[i].data.length;
	// 		if (last_offset > block_size) {
	// 			last_offset = 0;
	// 			block_num++;
	// 		}
	// 	} 
	// },

	get_info: () => {
		log('files count:', cache.filelist.length);
		let blocks_count = 0;
		cache.filelist.forEach( v => {
			if (v.block_num > blocks_count) 
				blocks_count = v.block_num;
		});
		log('blocks count:', blocks_count + 1);
		let last_idx = 0;
		for (let block_num = 0; block_num <= blocks_count; block_num++) {
			log(`[Block ${block_num}]`);
			const block_files = cache.filelist.filter( v => v.block_num === block_num);
			last_idx += block_files.length;
			let start_idx = last_idx - block_files.length;
			log(`  Index range: ${start_idx}-${last_idx - 1}`);
			for (let gamemode of Object.values(Gamemode)) {
				if (typeof gamemode === 'string'){
					continue
				}
				const block_gamemode = block_files.filter( v => v.gamemode === gamemode);
				log(`  ${Gamemode[gamemode]} files: ${block_gamemode.length} `);
			}
			const deleted_files = cache.filelist.filter( v => v.name_deleted );
			log(`  Deleted files: ${deleted_files.length}`);
			log(`  Total files: ${block_files.length}`);
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
				log('Ошибка чтения:', err);
				rej(err)
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
        
		const data = await new Promise( (res, rej) => {
				const stream = createReadStream( storage_path.destination + '_' + file.block_num + '.raw', {
					start: file.offset, 
					end: file.offset + file.size -1 
				});

				let result = null;

				stream.on('error', err => {
					log('Ошибка чтения:', err);
					rej(err)
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
			log(`Удален файл: ${name}`);
        } else {
			log(`Файл '${name}' не найден в списке.`);
		}
	},

    /**
	 * 
	 * @param {*} args 
	 * @param {string} args.filepath path to file
	 * @param {string} args.md5 md5 hash or nothing
	 * @returns index in storage
	 */
	add_one: async (args) => {
		if (!args.md5){
			log(`MD5 хэш не указан.`);
            return false;
		}
		
		if (find_ignore(args.md5)) {
			log(`[${args.md5}] Файл игнорируется.`);
            return false;
		}

		const filepath = args.filepath || null;

		let data = null;

		if (!filepath || !existsSync(filepath)) {
			log(`Файл '${filepath}' не найден.`);
			return false;
			//const res = await get_beatmap(args.md5);

			//if (!res) {
				// log(`Файл '${filepath}' не найден.`);
				// return false;
			//}
			//data = res;

        } else {
			data = readFileSync(filepath);
		}		

        //check md5 hash
		let md5 = _this.get_md5(data);

		if (args.md5 !== md5) {
			log(` [${args.md5}] MD5 хэш файла не совпадает -> ${md5}`);
			return false;

			//const res = await get_beatmap(md5);
			//if (!res) return false;
			// data = res;
			// md5 = _this.get_md5(res);
			// if (args.md5 !== md5) {
			// 	log(` MD5 хэши не совпадают`);
            //     return false;
			// }
        }

		//synonyms
		const name = md5;
		
		const i = cache.filelist.findIndex( v => v.name_deleted === name);

		//restore deleted
		if (i > -1) {
			cache.filelist[i].name = cache.filelist[i].name_deleted;
			delete cache.filelist[i].name_deleted;
            log(`[${i}] Восстановлен удаленный файл: ${name}`);
			return i;
		}

		//adding new file
		const idx = cache.filelist.length - 1;
		let last_offset = cache.filelist[idx]?.offset || 0;
		let last_size = cache.filelist[idx]?.size || 0;
		let block_num = cache.filelist[idx]?.block_num || 0;
		let offset = last_offset + last_size;
		let size = data.length;
		if (offset > block_size) {
			offset = 0;
			block_num++;
		}
		const file = { name, block_num, offset, size, data };
		const new_length = cache.filelist.push(file);
		const file_idx = new_length - 1;
		_this.save_one(file);
		process.stdout.write(`[${file_idx}] Добавлен новый файл: ${name}\r`);
		return file_idx;
	},

	get_md5: (data) => crypto.createHash('md5').update(data).digest("hex"),

	//check files, copy wrong to errors folder if md5 mismatch.
	check_all: async () => {     
		//create folders
		check_folder('errors');

		log('проверка всех файлов...');
		const chunk_size = Math.trunc(cache.filelist.length / 100);
		for (let i = 0; i < cache.filelist.length; i++) {
			if (!cache.filelist[i].name) {
				log('файл с индексом ', i,' удалён. Пропуск');
                continue;
			}
			if (i % chunk_size === 0) {
				const text = `(${((i / cache.filelist.length) * 100).toFixed(0)}%) Проверка ${i} из ${cache.filelist.length} файлов... `;
				process.stdout.write( text +'\r');
            }
			const res = await _this.check_one(i);
			if (!res) break;
		}
		log(`Проверка завершена.`);
		return true;
	},

	check_after: async ({ percent, num }) => {    
		console.time('check') 
		//create folders
		check_folder('errors');
		//check files, copy wrong to errors folder if md5 mismatch.
		log('проверка файлов...');
		let i = -1;
		const chunk_size = Math.trunc(cache.filelist.length / 1000);
		const skipping_idx = num ? Number(num) : chunk_size * percent ;

		for (let i = skipping_idx; i < cache.filelist.length; i++) {
			if (!cache.filelist[i].name) {
				log('файл с индексом ', i,' удалён. Пропуск');
                continue;
			}

			const text = `(${((i / cache.filelist.length) * 100).toFixed(0)}%) Проверка ${i} из ${cache.filelist.length} файлов... `;
			process.stdout.write( text +'\r');
			const res = await _this.check_one(i);
			if (!res) break;
		}
		log(`Проверка завершена.`);
		console.timeEnd('check')  // Stop the timer
		return true;
	},

	check_one: async (idx) => {     
		if (!cache.filelist[idx]) {
			log('файл с индексом ', idx,' не найден.');
            return false;
		}
		try {
			const data = await _this.read_one_by_index(idx);
			const md5 = _this.get_md5(data);
			if (md5 !== cache.filelist[idx].name) {
				writeFileSync(`errors/${cache.filelist[idx].name}`, data);
				log(`[${idx}] Ошибка md5 для '${cache.filelist[idx].name}': ожидалось ${cache.filelist[idx].name}, получено ${md5}`);
				return false;
			}
		} catch(e) {
			log(`[${i}] Ошибка при загрузке файла: ${cache.filelist[idx].name}`);
			process.exit()
		}

		return true;
	},

	remove_after: (name) => {
		if (name.length !== 32) {
			log('Имя файла должно быть md5-хэшем.');
            return false;
		}

		const idx = _this.findIndex(name);

		if (idx === -1) {
			log(`Файл '${name}' не найден в списке.`);
			return false;
		}

		const deleted = cache.filelist.splice(idx);
		

		if (deleted.length > 0) {
			log(`Было удалено ${deleted.length} файлов`);
			return { start_block: deleted[0].block_num }
		}
	},

	read_gamemode: async (i) => {
		if ( typeof cache.filelist[i].data === 'undefined' ) {
			try{
				cache.filelist[i].data = await _this.read_one_by_index(i);
			} catch(e) {
				log(`[${i}] Ошибка при загрузке файла: ${cache.filelist[i].name}`);
				process.exit()
			}
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
			log(`[${cache.filelist[i].name}] Не найдены данные gamemode в базе beatmaps.`);
		}
		return mode;
	},

	update_gamemode: async (beatmaps) => {
		const chunk_size = Math.trunc(cache.filelist.length / 100);
		for(let i = 0; i < cache.filelist.length; i++){
			//print progress
			if(i % chunk_size === 0) {
				const text = `(${((i / cache.filelist.length) * 100).toFixed(0)}%) Обновление gamemode для ${i} из ${cache.filelist.length} файлов... `;
				process.stdout.write( text +'\r');
            }
            
            if(cache.filelist[i].name === null) {
				log(`Файл пропущен ${cache.filelist[i].name_deleted} потому что удален.`);
                continue;
            }

			if(typeof cache.filelist[i].gamemode !== 'undefined') {
				continue;
			}
			
			const idx = beatmaps.findIndex( v => {
				return v.beatmap_md5 === cache.filelist[i].name });
			if(idx === -1) {
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
				log('gamemode undefined');
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

		const new_files_idx = [];

		if (to_copy.length === 0) {
			log('Нет новых файлов');
            return new_files_idx;
		}

		log(`Обнаружено ${to_copy.length} несовпадающих md5`);
		
		let saved = 0;

		for (const file of to_copy){
			if (file.beatmap_md5){
				continue;
			}

			if (find_ignore(file.beatmap_md5)) {
				continue;
            }

			const filepath = path.join(local_storage_path.osu, 'Songs', file.folder_name, file.osu_filename );
			const idx = await _this.add_one({ filepath, md5: file.beatmap_md5 });

			if (idx === false){
				add_ignore(file.beatmap_md5);
                continue;
            }
			
			cache.filelist[idx].gamemode = file.gamemode_int;
			new_files_idx.push(idx);
			saved++;
		}

		if (saved > 0) {
			_this.save_filelist(local_storage_path);
			log(`Скопировано ${saved} файлов`);
		} else {
			log('Ни один новый файл не добавлен');
		}

		return new_files_idx;
	},

	check_files_by_list: async (list) => {
		for (let i = 0; i < list.length; i++) {
			const text = `(${((i / list.length) * 100).toFixed(0)}%) проверка файлов ${i} из ${list.length} файлов... `;
			process.stdout.write( text +'\r');
			await _this.check_one(list[i]);
		}
	}
}