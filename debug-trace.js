const body = `*护甲（盾牌），极珍稀（需同调）*
持握这面盾牌期间，你的护甲等级获得 +2 加值。这是盾牌原本提供的 AC 加值外的额外加值。
持握这面盾牌期间，你可以使用以下额外词条。
**强力猛击（Forceful Bash）.** 当你执行攻击动作时`;

const lines = body.split(/\r?\n/);
let foundHeader = false;
let foundItalic = false;
const descriptionLines = [];

for (const line of lines) {
  const trimmed = line.trim();
  
  if (!foundHeader && /^##\s/.test(trimmed)) {
    foundHeader = true;
    console.log('Header:', trimmed.substring(0, 20));
    continue;
  }
  
  if (!foundItalic && /^\*[^*]+\*$/.test(trimmed)) {
    foundItalic = true;
    console.log('Italic FOUND:', trimmed);
    continue;
  }
  
  if (!foundHeader && !foundItalic && !trimmed) {
    continue;
  }
  
  if ((foundHeader || foundItalic) && trimmed) {
    descriptionLines.push(trimmed);
    console.log('Added:', trimmed.substring(0, 30));
  } else {
    console.log('Skipped:', trimmed.substring(0, 30));
  }
}

console.log('\nTotal collected:', descriptionLines.length);
console.log('Result:', descriptionLines);
