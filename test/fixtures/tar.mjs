export function tarArchive(name, contents) {
  const header = Buffer.alloc(512);
  header.write(name);
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(contents.length.toString(8).padStart(11, "0") + "\0", 124);
  header.fill(32, 148, 156);
  header.write("0", 156);
  header.write("ustar\0" + "00", 257);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148);
  return Buffer.concat([header, contents, Buffer.alloc((512 - contents.length % 512) % 512 + 1024)]);
}
