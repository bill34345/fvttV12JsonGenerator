const fs = require('fs');
const dict = JSON.parse(fs.readFileSync('data/cn.json', 'utf-8'));
const val = "心灵";
let res = null;
for(let k in dict) { if(dict[k] === val) res = k; }
console.log(res);
