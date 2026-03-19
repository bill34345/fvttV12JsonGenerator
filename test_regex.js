const p = "20尺";
const match = p.match(/^(?:(.*?)\s*)?(\d+)/);
const typeRaw = match[1] || 'walk';
console.log(match);
console.log(typeRaw);
