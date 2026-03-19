const value = "30尺, 游泳30尺";
const result = {};
const parts = value.split(/,|，/);
for (const part of parts) {
  const p = part.trim();
  const match = p.match(/^([^\d]*?)(\d+)/);
  if (match && match[2]) {
    let typeRaw = (match[1] || '').trim();
    const dist = parseInt(match[2]);
    if (typeRaw === 'walk' || typeRaw === '步行' || typeRaw === '') {
        result['walk'] = dist;
    } else {
        // ...
        if (typeRaw.includes('游泳')) result['swim'] = dist;
    }
  }
}
console.log(result);
