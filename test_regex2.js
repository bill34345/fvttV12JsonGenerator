const regex = /(?:(?:\d+)\s*\()?(?:\+)?(\d+d\d+(?:\s*[+\-]\s*\d+)?)\s*\)?\s*(?:点)?\s*(?:的)?\s*([\u4e00-\u9fa5]+)\s*伤害/g;
const text = "此外，目标在每次其回合开始时受到 5 (1d8) 点心灵伤害。目标在其每回合";
let m;
while ((m = regex.exec(text)) !== null) {
  console.log(m[1], m[2]);
}
