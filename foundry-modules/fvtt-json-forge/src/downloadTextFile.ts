
export function downloadTextFile(fileName: string, content: string, type: string): void {
  if (!globalThis.URL?.createObjectURL || !globalThis.document?.createElement) {
    throw new Error('当前浏览器不能下载文件。');
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
