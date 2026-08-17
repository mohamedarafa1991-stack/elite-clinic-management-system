import { deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipMember {
  name: string;
  data: Buffer;
}

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function ensureSafeMemberName(name: string): void {
  if (
    !name ||
    name.includes("\\") ||
    name.startsWith("/") ||
    name.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error(`ELITE_EXPORT_ZIP_MEMBER_INVALID: ${name}`);
  }
}

function writeDosDateTime(): { date: number; time: number } {
  return { date: 33, time: 0 };
}

export function createDeterministicZip(members: readonly ZipMember[]): Buffer {
  const sorted = [...members].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { date, time } = writeDosDateTime();

  for (const member of sorted) {
    ensureSafeMemberName(member.name);
    const name = Buffer.from(member.name, "utf8");
    const compressed = deflateRawSync(member.data, { level: 9 });
    const checksum = crc32(member.data);
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(LOCAL_FILE_HEADER, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(member.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    name.copy(header, 30);
    localParts.push(header, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(member.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += header.length + compressed.length;
  }

  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([local, central, end]);
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimum = Math.max(0, archive.length - 0xffff - 22);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY)
      return offset;
  }
  throw new Error(
    "ELITE_EXPORT_ZIP_INVALID: end of central directory not found",
  );
}

export function readDeterministicZip(archive: Buffer): readonly ZipMember[] {
  const endOffset = findEndOfCentralDirectory(archive);
  const count = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (centralOffset + centralSize > archive.length) {
    throw new Error(
      "ELITE_EXPORT_ZIP_INVALID: central directory is outside archive",
    );
  }

  const members: ZipMember[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_HEADER) {
      throw new Error(
        "ELITE_EXPORT_ZIP_INVALID: invalid central directory entry",
      );
    }
    const flags = archive.readUInt16LE(cursor + 8);
    const compression = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    ensureSafeMemberName(name);
    if (flags !== 0 || compression !== 8) {
      throw new Error(
        `ELITE_EXPORT_ZIP_INVALID: unsupported member encoding for ${name}`,
      );
    }
    if (archive.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      throw new Error(
        `ELITE_EXPORT_ZIP_INVALID: local header missing for ${name}`,
      );
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > archive.length) {
      throw new Error(
        `ELITE_EXPORT_ZIP_INVALID: member exceeds archive for ${name}`,
      );
    }
    const compressed = archive.subarray(dataOffset, dataEnd);
    const data = inflateRawSync(compressed);
    if (
      data.length !== uncompressedSize ||
      crc32(data) !== archive.readUInt32LE(cursor + 16)
    ) {
      throw new Error(
        `ELITE_EXPORT_ZIP_INVALID: checksum mismatch for ${name}`,
      );
    }
    members.push({ name, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return members;
}
