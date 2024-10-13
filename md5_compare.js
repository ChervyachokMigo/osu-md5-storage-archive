const md5File = require('md5-file');

const args = process.argv.slice(2);

const file_1 = md5File.sync(args[0]);
const file_2 = md5File.sync(args[1]);

if (file_1 === file_2) {
    console.log('MD5 hashes are equal.');

} else {
    console.log('MD5 hashes are not equal.');
    console.log('Difference:', args[0], args[1]);
}